import AppKit
import Foundation
import ServiceManagement

private struct CommandResult {
    let exitCode: Int32
    let output: String
}

private final class AutoSkinAppDelegate: NSObject, NSApplicationDelegate {
    private let worker = DispatchQueue(label: "app.autoskin.codex.worker", qos: .userInitiated)
    private var statusItem: NSStatusItem!
    private var stateItem: NSMenuItem!
    private var busyItem: NSMenuItem!
    private var themesMenu: NSMenu!
    private var refreshTimer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        buildMenu()
        registerLoginItem()
        ensureReady()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            self?.refreshStatus()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        refreshTimer?.invalidate()
    }

    private func registerLoginItem() {
        guard #available(macOS 13.0, *) else { return }
        if SMAppService.mainApp.status == .notRegistered {
            try? SMAppService.mainApp.register()
        }
    }

    private var commandScript: URL {
        guard let resources = Bundle.main.resourceURL else {
            fatalError("AutoSkin.app has no resource directory")
        }
        return resources.appendingPathComponent("autoskin-app-command.sh")
    }

    private func buildMenu() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "paintpalette.fill", accessibilityDescription: "AutoSkin")
            button.toolTip = "AutoSkin for Codex"
        }

        let menu = NSMenu()
        stateItem = NSMenuItem(title: "Checking AutoSkin…", action: nil, keyEquivalent: "")
        stateItem.isEnabled = false
        menu.addItem(stateItem)

        busyItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
        busyItem.isEnabled = false
        busyItem.isHidden = true
        menu.addItem(busyItem)
        menu.addItem(.separator())

        let themesItem = NSMenuItem(title: "Themes", action: nil, keyEquivalent: "")
        themesMenu = NSMenu()
        themesMenu.addItem(NSMenuItem(title: "Detecting themes…", action: nil, keyEquivalent: ""))
        themesItem.submenu = themesMenu
        menu.addItem(themesItem)
        menu.addItem(item("Re-scan and Apply", #selector(rescanAndApply)))
        menu.addItem(item("Verify", #selector(verifySkin)))
        menu.addItem(.separator())
        menu.addItem(item("Pause Skin", #selector(pauseSkin)))
        menu.addItem(item("Resume Skin", #selector(resumeSkin)))

        let layout = NSMenuItem(title: "Layout", action: nil, keyEquivalent: "")
        let layoutMenu = NSMenu()
        layoutMenu.addItem(item("Fullscreen", #selector(useFullscreen)))
        layoutMenu.addItem(item("Banner", #selector(useBanner)))
        layout.submenu = layoutMenu
        menu.addItem(layout)
        menu.addItem(.separator())
        menu.addItem(item("Open Theme Folder", #selector(openThemeFolder)))
        menu.addItem(item("Refresh Status", #selector(refreshStatusAction), key: "r"))
        menu.addItem(.separator())
        menu.addItem(item("Quit AutoSkin", #selector(quit), key: "q"))
        statusItem.menu = menu
    }

    private func item(_ title: String, _ action: Selector, key: String = "") -> NSMenuItem {
        let result = NSMenuItem(title: title, action: action, keyEquivalent: key)
        result.target = self
        return result
    }

    private func run(_ command: String, arguments: [String] = []) -> CommandResult {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = [commandScript.path, command] + arguments
        process.standardOutput = pipe
        process.standardError = pipe
        do {
            try process.run()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            return CommandResult(
                exitCode: process.terminationStatus,
                output: String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            )
        } catch {
            return CommandResult(exitCode: 127, output: error.localizedDescription)
        }
    }

    private func setBusy(_ text: String?) {
        busyItem.title = text ?? ""
        busyItem.isHidden = text == nil
        statusItem.button?.appearsDisabled = text != nil
    }

    private func runAction(
        _ command: String,
        arguments: [String] = [],
        title: String,
        showSuccess: Bool = false
    ) {
        setBusy("Working: \(title)…")
        worker.async { [weak self] in
            guard let self else { return }
            let result = self.run(command, arguments: arguments)
            DispatchQueue.main.async {
                self.setBusy(nil)
                self.refreshStatus()
                if result.exitCode != 0 || showSuccess {
                    self.showResult(title: title, result: result)
                }
            }
        }
    }

    private func showResult(title: String, result: CommandResult) {
        let alert = NSAlert()
        alert.alertStyle = result.exitCode == 0 ? .informational : .critical
        alert.messageText = result.exitCode == 0 ? "\(title) completed" : "\(title) failed"
        alert.informativeText = result.output.isEmpty ? "No additional output." : result.output
        alert.runModal()
    }

    private func refreshStatus() {
        worker.async { [weak self] in
            guard let self else { return }
            let result = self.run("status")
            let lines = result.output.split(separator: "\n").map(String.init)
            let values = Dictionary(uniqueKeysWithValues: lines.compactMap { line -> (String, String)? in
                guard let split = line.firstIndex(of: "=") else { return nil }
                return (String(line[..<split]), String(line[line.index(after: split)...]))
            })
            let session = values["session"] ?? (result.exitCode == 0 ? "unknown" : "not installed")
            let theme = values["theme"].flatMap { $0.isEmpty ? nil : $0 } ?? "—"
            let layout = values["layout"].flatMap { $0.isEmpty ? nil : $0 } ?? "—"
            let adapter = Double(values["adapter"] ?? "").map { " · DOM \(Int(($0 * 100).rounded()))%" } ?? ""
            let themeResult = self.run("themes")
            DispatchQueue.main.async {
                self.stateItem.title = "Status: \(session) · \(theme) · \(layout)\(adapter)"
                self.statusItem.button?.contentTintColor = session == "active" ? .systemTeal : nil
                self.updateThemesMenu(themeResult, selected: values["theme"] ?? "")
            }
        }
    }

    private func updateThemesMenu(_ result: CommandResult, selected: String) {
        themesMenu.removeAllItems()
        guard result.exitCode == 0,
              let data = result.output.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let themes = object["themes"] as? [[String: Any]],
              !themes.isEmpty else {
            let empty = NSMenuItem(title: "No installed themes", action: nil, keyEquivalent: "")
            empty.isEnabled = false
            themesMenu.addItem(empty)
            return
        }
        for theme in themes {
            guard let identifier = theme["name"] as? String else { continue }
            let title = (theme["button"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? identifier
            let entry = item(title, #selector(selectTheme))
            entry.representedObject = identifier
            entry.state = identifier == selected ? .on : .off
            themesMenu.addItem(entry)
        }
    }

    private func ensureReady() {
        setBusy("Detecting Codex and themes…")
        worker.async { [weak self] in
            guard let self else { return }
            let result = self.run("ensure")
            DispatchQueue.main.async {
                self.setBusy(nil)
                self.refreshStatus()
                if result.exitCode != 0 {
                    self.showResult(title: "Automatic AutoSkin setup", result: result)
                }
            }
        }
    }

    @objc private func rescanAndApply() {
        runAction("ensure", title: "Re-scan and apply AutoSkin", showSuccess: true)
    }

    @objc private func selectTheme(_ sender: NSMenuItem) {
        guard let identifier = sender.representedObject as? String else { return }
        runAction("theme", arguments: [identifier], title: "Switch to \(sender.title)")
    }

    @objc private func verifySkin() {
        runAction("verify", title: "Verify AutoSkin", showSuccess: true)
    }

    @objc private func pauseSkin() {
        runAction("pause", title: "Pause AutoSkin")
    }

    @objc private func resumeSkin() {
        runAction("resume", title: "Resume AutoSkin", showSuccess: true)
    }

    @objc private func useFullscreen() {
        runAction("layout", arguments: ["fullscreen"], title: "Use fullscreen layout")
    }

    @objc private func useBanner() {
        runAction("layout", arguments: ["banner"], title: "Use banner layout")
    }

    @objc private func openThemeFolder() {
        runAction("open-themes", title: "Open theme folder")
    }

    @objc private func refreshStatusAction() {
        refreshStatus()
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}

let application = NSApplication.shared
private let delegate = AutoSkinAppDelegate()
application.delegate = delegate
application.run()
