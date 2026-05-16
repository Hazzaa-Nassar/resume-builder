(function () {
  "use strict";

  const STORAGE_KEY = "cv-maker-draft";

  const PLACEHOLDERS = {
    name: "Your Name",
    title: "Professional Title",
    contact: "email@example.com",
    experience: "Your work experience will appear here.",
  };

  const form = document.getElementById("cv-form");
  const fields = {
    name: document.getElementById("name"),
    title: document.getElementById("title"),
    contact: document.getElementById("contact"),
    experience: document.getElementById("experience"),
  };

  const preview = {
    name: document.getElementById("preview-name"),
    title: document.getElementById("preview-title"),
    contact: document.getElementById("preview-contact"),
    experience: document.getElementById("preview-experience"),
  };

  const downloadBtn = document.getElementById("download-pdf");
  const clearBtn = document.getElementById("clear-form");

  function getValues() {
    return {
      name: fields.name.value.trim(),
      title: fields.title.value.trim(),
      contact: fields.contact.value.trim(),
      experience: fields.experience.value.trim(),
    };
  }

  function getRawValues() {
    return {
      name: fields.name.value,
      title: fields.title.value,
      contact: fields.contact.value,
      experience: fields.experience.value,
    };
  }

  function displayText(value, fallback) {
    return value || fallback;
  }

  function updateResume() {
    const data = getValues();

    preview.name.textContent = displayText(data.name, PLACEHOLDERS.name);
    preview.title.textContent = displayText(data.title, PLACEHOLDERS.title);
    preview.contact.textContent = displayText(data.contact, PLACEHOLDERS.contact);

    const expText = displayText(data.experience, PLACEHOLDERS.experience);
    preview.experience.textContent = expText;
    preview.experience.classList.toggle("is-placeholder", !data.experience);
  }

  function saveToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getRawValues()));
    } catch (err) {
      console.warn("Could not save draft:", err);
    }
  }

  function loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return false;
      }

      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") {
        return false;
      }

      fields.name.value = data.name ?? "";
      fields.title.value = data.title ?? "";
      fields.contact.value = data.contact ?? "";
      fields.experience.value = data.experience ?? "";
      return true;
    } catch (err) {
      console.warn("Could not load draft:", err);
      return false;
    }
  }

  function clearLocalStorage() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function handleInput() {
    saveToLocalStorage();
    updateResume();
  }

  function clearForm() {
    fields.name.value = "";
    fields.title.value = "";
    fields.contact.value = "";
    fields.experience.value = "";
    clearLocalStorage();
    updateResume();
  }

  function sanitizeFilename(name) {
    const base = (name || "resume").replace(/[^\w\s-]/g, "").trim() || "resume";
    return base.replace(/\s+/g, "-").toLowerCase() + ".pdf";
  }

  function buildPdf(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 20;
    const marginTop = 22;
    const marginBottom = 20;
    const contentWidth = pageWidth - marginX * 2;
    let y = marginTop;

    const name = displayText(data.name, PLACEHOLDERS.name);
    const title = displayText(data.title, PLACEHOLDERS.title);
    const contact = displayText(data.contact, PLACEHOLDERS.contact);
    const experience = displayText(data.experience, PLACEHOLDERS.experience);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(name, marginX, y);
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(80, 86, 96);
    doc.text(title, marginX, y);
    y += 7;

    doc.setFontSize(10);
    doc.text(contact, marginX, y);
    y += 6;

    doc.setDrawColor(26, 29, 35);
    doc.setLineWidth(0.4);
    doc.line(marginX, y + 2, pageWidth - marginX, y + 2);
    y += 12;

    doc.setTextColor(26, 29, 35);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("EXPERIENCE", marginX, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const lineHeight = 5.5;
    const lines = doc.splitTextToSize(experience, contentWidth);

    lines.forEach(function (line) {
      if (y > pageHeight - marginBottom) {
        doc.addPage();
        y = marginTop;
      }
      doc.text(line, marginX, y);
      y += lineHeight;
    });

    return doc;
  }

  function downloadPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("PDF library failed to load. Check your internet connection and refresh.");
      return;
    }

    const data = getValues();
    const doc = buildPdf(data);
    doc.save(sanitizeFilename(data.name));
  }

  form.addEventListener("input", handleInput);
  downloadBtn.addEventListener("click", downloadPdf);
  clearBtn.addEventListener("click", clearForm);

  loadFromLocalStorage();
  updateResume();
})();
