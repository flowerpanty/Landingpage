(() => {
  const form = document.querySelector("[data-gallery-form]");
  const list = document.querySelector("[data-gallery-list]");
  const status = document.querySelector("[data-status]");
  const refreshButton = document.querySelector("[data-refresh]");
  const storageStatus = document.querySelector("[data-gallery-storage-status]");
  const storageRefreshButton = document.querySelector("[data-storage-refresh]");
  const preview = document.querySelector("[data-preview]");
  const fileName = document.querySelector("[data-file-name]");
  const tokenStorageKey = "nm_gallery_admin_token";

  if (!form || !list || !status) return;

  const fileInput = form.elements.photo;
  const tokenInput = form.elements.token;
  tokenInput.value = window.sessionStorage.getItem(tokenStorageKey) || "";

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  };

  const manifestStatusLabels = {
    ok: "정상",
    missing: "없음",
    read_error: "읽기 오류",
    parse_error: "JSON 오류",
    invalid_format: "형식 오류"
  };

  const renderStorageMessage = (message, isError = false) => {
    if (!storageStatus) return;
    storageStatus.innerHTML = "";
    const item = document.createElement("p");
    item.className = `gallery-admin-empty${isError ? " is-error" : ""}`;
    item.textContent = message;
    storageStatus.append(item);
  };

  const addStorageItem = (label, value, options = {}) => {
    const item = document.createElement("article");
    item.className = "gallery-admin-storage-item";
    if (options.wide) item.classList.add("gallery-admin-storage-item--wide");
    if (options.warning) item.classList.add("is-warning");
    const title = document.createElement("strong");
    title.textContent = label;
    const content = document.createElement("span");
    content.textContent = value;
    item.append(title, content);
    storageStatus.append(item);
  };

  const formatTimestamp = (value) => {
    if (!value) return "-";
    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime()) ? "확인 불가" : timestamp.toLocaleString("ko-KR");
  };

  const renderStorageStatus = (data) => {
    if (!storageStatus) return;
    storageStatus.innerHTML = "";
    const manifestStatus = manifestStatusLabels[data.manifestStatus] || "확인 불가";
    const missingReferencedImages = data.missingReferencedImageCount;
    const emptyStorage = data.manifestStatus === "missing" && data.galleryImageFileCount === 0;
    const storageHealthy = data.storageDirectoryExists && data.storageDirectoryWritable &&
      ((data.manifestStatus === "ok" && missingReferencedImages === 0) || emptyStorage);
    const storageLabel = storageHealthy
      ? (emptyStorage ? "정상 · 빈 저장소" : "정상")
      : "확인 필요";

    addStorageItem("저장소", storageLabel, { warning: !storageHealthy });
    addStorageItem("manifest", `${manifestStatus} · ${data.manifestItemCount ?? 0}개 항목`, {
      warning: !["ok", "missing"].includes(data.manifestStatus)
    });
    addStorageItem("실제 이미지 파일", `${data.galleryImageFileCount ?? "확인 불가"}개`);
    addStorageItem(
      "참조 이미지 누락",
      `${missingReferencedImages ?? "확인 불가"}개`,
      { warning: Boolean(missingReferencedImages) }
    );
    addStorageItem(
      "고아 이미지 파일",
      `${data.orphanImageFileCount ?? "확인 불가"}개`,
      { warning: Boolean(data.orphanImageFileCount) }
    );
    addStorageItem("manifest 수정 시각", formatTimestamp(data.manifestModifiedAt));
    addStorageItem("저장 경로", data.storagePath || "확인 불가", { wide: true });
    addStorageItem(
      "GALLERY_DATA_DIR",
      data.galleryDataDirConfigured ? "설정됨" : "미설정 · 기본 경로 사용 중",
      { warning: !data.galleryDataDirConfigured }
    );
    addStorageItem(
      "쓰기 권한",
      data.storageDirectoryWritable ? "쓰기 가능" : "쓰기 불가",
      { warning: !data.storageDirectoryWritable }
    );
  };

  const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const loadImageElement = (file) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("이 사진 형식은 현재 브라우저에서 읽을 수 없습니다."));
      };
      image.src = objectUrl;
    });

  const optimizeImage = async (file) => {
    let source;
    if ("createImageBitmap" in window) {
      try {
        source = await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch (error) {
        source = null;
      }
    }
    if (!source) source = await loadImageElement(file);
    const sourceWidth = source.width || source.naturalWidth;
    const sourceHeight = source.height || source.naturalHeight;
    const maxDimension = 1800;
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sourceWidth * scale);
    canvas.height = Math.round(sourceHeight * scale);
    canvas.getContext("2d", { alpha: false }).drawImage(source, 0, 0, canvas.width, canvas.height);
    source.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
    if (!blob) throw new Error("이미지를 변환하지 못했습니다.");
    return blob;
  };

  const removeItem = async (id, button) => {
    const token = tokenInput.value.trim();
    if (!token) {
      setStatus("관리자 키를 먼저 입력해주세요.", true);
      tokenInput.focus();
      return;
    }

    button.disabled = true;
    try {
      const response = await fetch(`/api/gallery/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "X-Gallery-Admin-Token": token }
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "삭제하지 못했습니다.");
      setStatus("사진을 삭제했습니다.");
      await Promise.all([loadGallery(), loadStorageStatus()]);
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      button.disabled = false;
    }
  };

  const renderList = (items) => {
    const uploaded = items.filter((item) => item.userUploaded);
    list.innerHTML = "";

    if (!uploaded.length) {
      const empty = document.createElement("p");
      empty.className = "gallery-admin-empty";
      empty.textContent = "아직 직접 올린 사진이 없습니다.";
      list.append(empty);
      return;
    }

    uploaded.forEach((item) => {
      const card = document.createElement("article");
      card.className = "gallery-admin-card";
      const image = document.createElement("img");
      image.src = item.src;
      image.alt = item.caption || "업로드한 쿠키 사진";
      image.loading = "lazy";
      const body = document.createElement("div");
      const caption = document.createElement("p");
      caption.textContent = item.caption || "최근 만든 쿠키";
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = "삭제";
      removeButton.addEventListener("click", () => removeItem(item.id, removeButton));
      body.append(caption, removeButton);
      card.append(image, body);
      list.append(card);
    });
  };

  const loadGallery = async () => {
    const response = await fetch("/api/gallery", { headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "사진을 불러오지 못했습니다.");
    renderList(payload.items || []);
  };

  const loadStorageStatus = async () => {
    if (!storageStatus) return;
    const token = tokenInput.value.trim();
    if (!token) {
      renderStorageMessage("관리자 키를 입력하면 저장소 상태를 확인할 수 있어요.");
      return;
    }

    try {
      const response = await fetch("/api/gallery/status", {
        headers: { "X-Gallery-Admin-Token": token }
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "저장소 상태를 불러오지 못했습니다.");
      renderStorageStatus(payload);
    } catch (error) {
      renderStorageMessage(error.message || "저장소 상태를 불러오지 못했습니다.", true);
    }
  };

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileName.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)}MB`;
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  });

  refreshButton?.addEventListener("click", () => {
    Promise.all([loadGallery(), loadStorageStatus()]).catch((error) => setStatus(error.message, true));
  });

  storageRefreshButton?.addEventListener("click", () => loadStorageStatus());
  tokenInput.addEventListener("change", () => loadStorageStatus());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector("button[type=submit]");
    const file = fileInput.files?.[0];
    const token = tokenInput.value.trim();

    if (!file || !token) {
      setStatus("관리자 키와 사진을 확인해주세요.", true);
      return;
    }

    submitButton.disabled = true;
    setStatus("사진을 정리해서 올리는 중입니다.");
    window.sessionStorage.setItem(tokenStorageKey, token);

    try {
      const optimized = await optimizeImage(file);
      const dataUrl = await blobToDataUrl(optimized);
      const response = await fetch("/api/gallery", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gallery-Admin-Token": token
        },
        body: JSON.stringify({
          dataUrl,
          caption: form.elements.caption.value,
          href: form.elements.href.value
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "업로드하지 못했습니다.");

      fileInput.value = "";
      form.elements.caption.value = "";
      form.elements.href.value = "";
      preview.hidden = true;
      fileName.textContent = "휴대폰 사진 가능 · 자동 압축";
      setStatus("홈 RECENTLY MADE에 사진을 추가했습니다.");
      await Promise.all([loadGallery(), loadStorageStatus()]);
    } catch (error) {
      setStatus(error.message || "업로드하지 못했습니다.", true);
    } finally {
      submitButton.disabled = false;
    }
  });

  loadGallery().catch((error) => setStatus(error.message, true));
  loadStorageStatus();
})();
