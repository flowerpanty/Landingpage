(function () {
  const fieldErrorClass = "fieldError";

  function track(eventName, params) {
    if (!eventName || typeof window.gtag !== "function") return;
    try {
      window.gtag("event", eventName, {
        event_category: "order_builder",
        page_path: window.location.pathname,
        ...params
      });
    } catch (_) { /* Analytics must not interrupt validation, saving or sharing. */ }
  }

  const operatingSettings = {
    minimumLeadDays: 1,
    unavailableDates: [],
    pickupTimeOptions: [
      "10:00~11:00",
      "11:00~12:00",
      "12:00~13:00",
      "13:00~14:00",
      "14:00~15:00",
      "15:00~16:00",
      "16:00~17:00"
    ]
  };

  function toDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getMinDeliveryDate(baseDate) {
    const next = baseDate instanceof Date ? new Date(baseDate) : new Date();
    next.setDate(next.getDate() + operatingSettings.minimumLeadDays);
    return toDateInputValue(next);
  }

  function isUnavailableDeliveryDate(dateString) {
    return operatingSettings.unavailableDates.includes(dateString);
  }

  function validateKoreanPhone(value) {
    return /^010[-\s]?\d{4}[-\s]?\d{4}$/.test(String(value || "").trim());
  }

  function landingApiUrl() {
    return window.location.protocol === "file:"
      ? "https://thingmattersreserve-production.up.railway.app/api/landing-orders"
      : "/api/landing-orders";
  }

  async function postLandingOrder(payload) {
    const response = await fetch(landingApiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      throw new Error(result.message || "주문 저장에 실패했어요.");
    }
    return result;
  }

  function getField(id) {
    return typeof id === "string" ? document.getElementById(id) : id;
  }

  function getErrorNode(field) {
    if (!field) return null;
    const id = field.id ? `${field.id}Error` : "";
    if (id) {
      const byId = document.getElementById(id);
      if (byId) return byId;
    }

    const parent = field.closest("label, .dateBox, .methodExtra, .fieldShell") || field.parentElement;
    return parent ? parent.querySelector(`.${fieldErrorClass}`) : null;
  }

  function setFieldError(fieldOrId, message) {
    const field = getField(fieldOrId);
    if (!field) return false;
    const errorNode = getErrorNode(field);
    field.setAttribute("aria-invalid", "true");
    field.classList.add("is-invalid");

    if (errorNode) {
      errorNode.textContent = message;
      errorNode.hidden = false;
      if (errorNode.id) field.setAttribute("aria-describedby", errorNode.id);
    }

    return false;
  }

  function clearFieldError(fieldOrId) {
    const field = getField(fieldOrId);
    if (!field) return;
    const errorNode = getErrorNode(field);
    field.removeAttribute("aria-invalid");
    field.classList.remove("is-invalid");

    if (errorNode) {
      errorNode.textContent = "";
      errorNode.hidden = true;
    }
  }

  function focusField(fieldOrId) {
    const field = getField(fieldOrId);
    if (!field) return;
    field.focus({ preventScroll: true });
    field.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function setupStepHistory(options) {
    const getStep = options.getStep;
    const setStep = options.setStep;
    let internal = false;

    const normalizeStep = (value) => {
      const next = Number.parseInt(value || "", 10);
      return Number.isFinite(next) ? next : getStep();
    };

    const currentUrlStep = normalizeStep(new URLSearchParams(window.location.search).get("step"));
    if (currentUrlStep && currentUrlStep !== getStep()) {
      internal = true;
      setStep(currentUrlStep, { fromHistory: true, skipValidation: true });
      internal = false;
    }

    window.addEventListener("popstate", (event) => {
      const step = normalizeStep(event.state?.step || new URLSearchParams(window.location.search).get("step"));
      internal = true;
      setStep(step, { fromHistory: true, skipValidation: true });
      internal = false;
    });

    return function pushStep(step) {
      if (internal) return;
      const url = new URL(window.location.href);
      url.searchParams.set("step", String(step));
      window.history.pushState({ step }, "", url);
    };
  }

  window.NMOrderCore = {
    clearFieldError,
    focusField,
    getMinDeliveryDate,
    isUnavailableDeliveryDate,
    postLandingOrder,
    operatingSettings,
    setFieldError,
    setupStepHistory,
    track,
    validateKoreanPhone
  };
})();
