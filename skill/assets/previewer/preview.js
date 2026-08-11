(() => {
  "use strict";
  const theme = window.AUTOSKIN_THEME;
  if (!theme) throw new Error("theme-data.js did not define AUTOSKIN_THEME");

  const $ = (selector) => document.querySelector(selector);
  const stage = $("#stage");
  const surfaceControl = $("#surface");
  const viewportControl = $("#viewport");
  const guidesControl = $("#guides");
  const params = new URLSearchParams(location.search);
  if (params.get("capture") === "1") document.body.classList.add("capture");
  const viewports = {
    desktop: [1728, 1117],
    wide: [1920, 1080],
    narrow: [1280, 900],
  };

  const hexRgb = (hex) => {
    const value = hex.slice(1);
    return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  };
  const rgba = (hex, alpha) => `rgba(${hexRgb(hex).join(", ")}, ${alpha})`;
  const artUrl = (value) => value ? `url("${value.replaceAll('"', '\\"')}")` : "none";
  const sizeFor = (view) => view.scale === 1 ? view.fit : `${view.scale * 100}% auto`;
  const positionFor = (view) => `${view.focalPoint[0] * 100}% ${view.focalPoint[1] * 100}%`;
  const overlayFor = (overlay) => {
    const color = overlay.color;
    const strength = overlay.strength;
    const [x, y] = overlay.anchor;
    if (overlay.kind === "solid") return rgba(color, strength);
    if (overlay.kind === "radial") {
      return `radial-gradient(115% 92% at ${x * 100}% ${y * 100}%, ${rgba(color, strength)}, ${rgba(color, strength * .55)} 42%, ${rgba(color, strength * .18)} 68%, transparent 86%)`;
    }
    const direction = x <= .5 ? "90deg" : "270deg";
    return `linear-gradient(${direction}, ${rgba(color, strength)}, ${rgba(color, strength * .72)} 52%, ${rgba(color, strength * .26)} 78%, transparent)`;
  };

  function setImage(image, path) {
    if (path) {
      image.src = path;
      image.hidden = false;
    } else {
      image.hidden = true;
    }
  }

  function renderStatic() {
    const { meta, components, content, assets } = theme;
    document.title = `${meta.name} · AutoSkin Codex Preview`;
    $("#preview-name").textContent = meta.name;
    $("#brand-title").textContent = meta.name;
    $("#brand-edition").textContent = meta.edition;
    $("#brand-signature").textContent = meta.signature;
    setImage($("#brand-icon"), assets.brandIcon);
    setImage($("#mode-icon"), assets.brandIcon);
    $("#hero-title").textContent = content.heroTitle.replace("{{project}}", "skill");
    $("#hero-subtitle").textContent = content.heroSubtitle;
    $("#composer-placeholder").textContent = content.composerPlaceholder;
    $("#chat-placeholder").textContent = content.composerPlaceholder;

    stage.style.setProperty("--chrome-bg", components.chrome.background);
    stage.style.setProperty("--chrome-title", components.chrome.title);
    stage.style.setProperty("--chrome-border", components.chrome.border);
    stage.style.setProperty("--sidebar-bg", components.sidebar.background);
    stage.style.setProperty("--sidebar-text", components.sidebar.text);
    stage.style.setProperty("--sidebar-active", components.sidebar.active);
    stage.style.setProperty("--new-task", components.sidebar.newTask);
    stage.style.setProperty("--card-fill", rgba(components.cards.fill, components.cards.opacity));
    stage.style.setProperty("--card-blur", `${components.cards.blur}px`);
    stage.style.setProperty("--card-radius", `${components.cards.radius}px`);
    stage.style.setProperty("--card-shadow", components.cards.shadow);
    stage.style.setProperty("--card-title", components.cards.title);
    stage.style.setProperty("--card-subtitle", components.cards.subtitle);
    stage.style.setProperty("--composer-fill", rgba(components.composer.fill, components.composer.opacity));
    stage.style.setProperty("--composer-blur", `${components.composer.blur}px`);
    stage.style.setProperty("--composer-radius", `${components.composer.radius}px`);
    stage.style.setProperty("--composer-shadow", components.composer.shadow);
    stage.style.setProperty("--composer-outer", components.composer.outerBackground);
    stage.style.setProperty("--composer-text", components.composer.text);

    const cards = $("#cards");
    cards.replaceChildren();
    content.cards.forEach((card, index) => {
      const node = document.createElement("article");
      node.className = "card";
      const image = document.createElement("img");
      const icon = assets.cardIcons[index];
      if (icon) image.src = icon;
      else image.style.visibility = "hidden";
      const title = document.createElement("strong");
      title.textContent = card.title;
      const subtitle = document.createElement("small");
      subtitle.textContent = card.subtitle;
      node.append(image, title, subtitle);
      cards.append(node);
    });

    const decorations = $(".decorations");
    decorations.replaceChildren();
    theme.decorations.forEach((item) => {
      const node = item.kind === "image" ? document.createElement("img") : document.createElement("span");
      node.className = "decoration";
      node.dataset.surface = item.surface;
      node.style.left = `${item.position[0] * 100}%`;
      node.style.top = `${item.position[1] * 100}%`;
      node.style.opacity = item.opacity;
      if (item.kind === "image") {
        node.src = item.asset;
        node.style.width = `${item.size ?? 32}px`;
      } else {
        node.textContent = item.value;
        node.style.color = item.color;
        node.style.fontSize = `${item.size}px`;
      }
      decorations.append(node);
    });
  }

  function renderView() {
    const surface = surfaceControl.value;
    const viewport = viewportControl.value;
    const view = theme.views[surface];
    const art = surface === "chat" && theme.assets.chatBackground
      ? theme.assets.chatBackground
      : theme.assets.background;
    const [width, height] = viewports[viewport];
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    stage.style.setProperty("--art", artUrl(art));
    stage.style.setProperty("--art-size", sizeFor(view));
    stage.style.setProperty("--art-position", positionFor(view));
    stage.style.setProperty("--art-opacity", view.opacity);
    stage.style.setProperty("--art-overlay", overlayFor(view.overlay));
    stage.classList.toggle("surface-chat", surface === "chat");
    stage.classList.toggle("guides-on", guidesControl.checked);
    [...document.querySelectorAll(".decoration")].forEach((node) => {
      node.hidden = !(node.dataset.surface === "all" || node.dataset.surface === (surface === "chat" ? "chat" : "home"));
    });
    $("#preview-mode").textContent = `${surface} · ${viewport}`;
    fitStage();
  }

  function fitStage() {
    if (document.body.classList.contains("capture")) return;
    const shell = $(".stage-shell");
    const available = Math.max(720, shell.clientWidth - 44);
    const width = parseFloat(stage.style.width);
    const scale = Math.min(1, available / width);
    stage.style.transform = `scale(${scale})`;
    shell.style.height = `${parseFloat(stage.style.height) * scale + 44}px`;
  }

  surfaceControl.value = params.get("surface") || "fullscreen";
  viewportControl.value = params.get("viewport") || "desktop";
  guidesControl.checked = params.get("guides") === "1";
  renderStatic();
  renderView();
  surfaceControl.addEventListener("change", renderView);
  viewportControl.addEventListener("change", renderView);
  guidesControl.addEventListener("change", renderView);
  addEventListener("resize", fitStage);
})();
