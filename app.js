(function () {
  "use strict";

  const STORAGE_KEY = "cv-maker-draft";
  const DEFAULT_FONT = "sans";

  const FONT_OPTIONS = {
    sans: {
      stack: "Helvetica, Arial, sans-serif",
      pdf: "helvetica",
    },
    serif: {
      stack: 'Georgia, "Times New Roman", Times, serif',
      pdf: "times",
    },
    mono: {
      stack: '"Courier New", Courier, monospace',
      pdf: "courier",
    },
  };

  const PLACEHOLDERS = {
    name: "Your Name",
    title: "Professional Title",
    contact: "email@example.com",
    summary: "Your professional summary will appear here.",
    experience: "Your work experience will appear here.",
    education: "Your education will appear here.",
    skills: "Add skills in the form",
    languages: "Add languages in the form",
  };

  const EMPTY_EDUCATION = {
    school: "",
    degree: "",
    field: "",
    graduationDate: "",
    certifications: "",
  };

  const EMPTY_LANGUAGE = {
    language: "",
    proficiency: "",
  };

  const form = document.getElementById("cv-form");
  const fields = {
    name: document.getElementById("name"),
    title: document.getElementById("title"),
    contact: document.getElementById("contact"),
    summary: document.getElementById("summary"),
    experience: document.getElementById("experience"),
    skills: document.getElementById("skills"),
  };

  const preview = {
    name: document.getElementById("preview-name"),
    title: document.getElementById("preview-title"),
    contact: document.getElementById("preview-contact"),
    summary: document.getElementById("preview-summary"),
    experience: document.getElementById("preview-experience"),
    education: document.getElementById("preview-education"),
    skills: document.getElementById("preview-skills"),
    languages: document.getElementById("preview-languages"),
  };

  const educationListEl = document.getElementById("education-list");
  const languagesListEl = document.getElementById("languages-list");
  const addEducationBtn = document.getElementById("add-education");
  const addLanguageBtn = document.getElementById("add-language");
  const downloadBtn = document.getElementById("download-pdf");
  const clearBtn = document.getElementById("clear-form");
  const fontSelect = document.getElementById("resume-font");
  const resumePreview = document.getElementById("resume-preview");
  const resumePreviewContent = document.getElementById("resume-preview-content");
  const overflowWarning = document.getElementById("page-overflow-warning");
  const resumeHeader = resumePreviewContent.querySelector(".resume-header");

  let overflowRaf = 0;

  function getFontKey() {
    const key = fontSelect.value;
    return FONT_OPTIONS[key] ? key : DEFAULT_FONT;
  }

  function applyFont(fontKey) {
    const resolved = FONT_OPTIONS[fontKey] ? fontKey : DEFAULT_FONT;
    const { stack } = FONT_OPTIONS[resolved];
    fontSelect.value = resolved;
    resumePreview.style.setProperty("--resume-font", stack);
    scheduleOverflowCheck();
  }

  function scheduleOverflowCheck() {
    if (overflowRaf) {
      cancelAnimationFrame(overflowRaf);
    }
    overflowRaf = requestAnimationFrame(function () {
      overflowRaf = 0;
      checkPageOverflow();
    });
  }

  function checkPageOverflow() {
    const pageHeight = resumePreview.clientHeight;
    const contentHeight = resumePreviewContent.scrollHeight;
    const pageOverflows = contentHeight > pageHeight + 1;
    const cutoffY = resumePreview.getBoundingClientRect().bottom;

    resumePreview.classList.toggle("is-overflowing", pageOverflows);
    if (overflowWarning) {
      overflowWarning.hidden = !pageOverflows;
    }

    const overflowTargets = resumePreviewContent.querySelectorAll(
      ".resume-header, .resume-summary, .resume-section, .resume-meta-row"
    );
    overflowTargets.forEach(function (el) {
      const crossesCutoff = el.getBoundingClientRect().bottom > cutoffY - 1;
      el.classList.toggle("is-overflowing", crossesCutoff);
    });
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function displayText(value, fallback) {
    return value || fallback;
  }

  function parseSkills(raw) {
    return raw
      .split(/[,;|]/)
      .map(function (skill) {
        return skill.trim();
      })
      .filter(Boolean);
  }

  function normalizeEducation(entry) {
    return {
      school: (entry && entry.school) || "",
      degree: (entry && entry.degree) || "",
      field: (entry && entry.field) || "",
      graduationDate: (entry && entry.graduationDate) || "",
      certifications: (entry && entry.certifications) || "",
    };
  }

  function normalizeLanguage(entry) {
    return {
      language: (entry && entry.language) || "",
      proficiency: (entry && entry.proficiency) || "",
    };
  }

  function educationHasContent(entry) {
    const e = normalizeEducation(entry);
    return Boolean(
      e.school || e.degree || e.field || e.graduationDate || e.certifications
    );
  }

  function languageHasContent(entry) {
    const l = normalizeLanguage(entry);
    return Boolean(l.language || l.proficiency);
  }

  function collectEducationFromDOM() {
    return Array.from(educationListEl.querySelectorAll(".repeatable-card")).map(
      function (card) {
        return normalizeEducation({
          school: card.querySelector('[data-field="school"]')?.value ?? "",
          degree: card.querySelector('[data-field="degree"]')?.value ?? "",
          field: card.querySelector('[data-field="field"]')?.value ?? "",
          graduationDate:
            card.querySelector('[data-field="graduationDate"]')?.value ?? "",
          certifications:
            card.querySelector('[data-field="certifications"]')?.value ?? "",
        });
      }
    );
  }

  function collectLanguagesFromDOM() {
    return Array.from(languagesListEl.querySelectorAll(".repeatable-card")).map(
      function (card) {
        return normalizeLanguage({
          language: card.querySelector('[data-field="language"]')?.value ?? "",
          proficiency:
            card.querySelector('[data-field="proficiency"]')?.value ?? "",
        });
      }
    );
  }

  function buildEducationCard(entry, index) {
    const card = document.createElement("fieldset");
    card.className = "repeatable-card";
    card.dataset.index = String(index);
    card.innerHTML =
      '<legend class="repeatable-card__legend">School ' +
      (index + 1) +
      '</legend>' +
      '<button type="button" class="repeatable-card__remove" data-action="remove-education" aria-label="Remove this school">Remove</button>' +
      '<div class="field"><label>School / university</label>' +
      '<input type="text" data-field="school" placeholder="State University" spellcheck="false" value="' +
      escapeHtml(entry.school) +
      '"></div>' +
      '<div class="repeatable-card__row">' +
      '<div class="field"><label>Degree</label>' +
      '<input type="text" data-field="degree" placeholder="B.A." spellcheck="false" value="' +
      escapeHtml(entry.degree) +
      '"></div>' +
      '<div class="field"><label>Field of study</label>' +
      '<input type="text" data-field="field" placeholder="Computer Science" spellcheck="false" value="' +
      escapeHtml(entry.field) +
      '"></div>' +
      "</div>" +
      '<div class="field"><label>Graduation date</label>' +
      '<input type="text" data-field="graduationDate" placeholder="May 2022" spellcheck="false" value="' +
      escapeHtml(entry.graduationDate) +
      '"></div>' +
      '<div class="field"><label>Certifications</label>' +
      '<input type="text" data-field="certifications" placeholder="AWS Certified Developer" spellcheck="false" value="' +
      escapeHtml(entry.certifications) +
      '"></div>';
    return card;
  }

  function buildLanguageCard(entry, index) {
    const card = document.createElement("fieldset");
    card.className = "repeatable-card";
    card.dataset.index = String(index);
    card.innerHTML =
      '<legend class="repeatable-card__legend">Language ' +
      (index + 1) +
      '</legend>' +
      '<button type="button" class="repeatable-card__remove" data-action="remove-language" aria-label="Remove this language">Remove</button>' +
      '<div class="repeatable-card__row">' +
      '<div class="field"><label>Language</label>' +
      '<input type="text" data-field="language" placeholder="Spanish" spellcheck="false" value="' +
      escapeHtml(entry.language) +
      '"></div>' +
      '<div class="field"><label>Proficiency</label>' +
      '<input type="text" data-field="proficiency" placeholder="Conversational" spellcheck="false" value="' +
      escapeHtml(entry.proficiency) +
      '"></div>' +
      "</div>";
    return card;
  }

  function renderEducationList(entries) {
    const list =
      entries && entries.length ? entries.map(normalizeEducation) : [EMPTY_EDUCATION];
    educationListEl.replaceChildren();
    list.forEach(function (entry, index) {
      educationListEl.appendChild(buildEducationCard(entry, index));
    });
  }

  function renderLanguagesList(entries) {
    const list =
      entries && entries.length ? entries.map(normalizeLanguage) : [EMPTY_LANGUAGE];
    languagesListEl.replaceChildren();
    list.forEach(function (entry, index) {
      languagesListEl.appendChild(buildLanguageCard(entry, index));
    });
  }

  function formatEducationEntry(entry) {
    const e = normalizeEducation(entry);
    const degreeLine = [e.degree, e.field].filter(Boolean).join(", ");
    const parts = [];

    if (e.school) {
      parts.push('<p class="education-entry__school">' + escapeHtml(e.school) + "</p>");
    }
    if (degreeLine) {
      parts.push(
        '<p class="education-entry__degree">' + escapeHtml(degreeLine) + "</p>"
      );
    }
    if (e.graduationDate) {
      parts.push(
        '<p class="education-entry__date">' + escapeHtml(e.graduationDate) + "</p>"
      );
    }
    if (e.certifications) {
      parts.push(
        '<p class="education-entry__certs">' +
          escapeHtml(e.certifications) +
          "</p>"
      );
    }
    return parts.length ? '<div class="education-entry">' + parts.join("") + "</div>" : "";
  }

  function getValues() {
    const education = collectEducationFromDOM().filter(educationHasContent);
    const languages = collectLanguagesFromDOM().filter(languageHasContent);

    return {
      name: fields.name.value.trim(),
      title: fields.title.value.trim(),
      contact: fields.contact.value.trim(),
      summary: fields.summary.value.trim(),
      experience: fields.experience.value.trim(),
      education: education,
      skills: parseSkills(fields.skills.value),
      languages: languages,
    };
  }

  function getRawValues() {
    return {
      name: fields.name.value,
      title: fields.title.value,
      contact: fields.contact.value,
      summary: fields.summary.value,
      experience: fields.experience.value,
      education: collectEducationFromDOM(),
      skills: fields.skills.value,
      languages: collectLanguagesFromDOM(),
      fontFamily: getFontKey(),
    };
  }

  function renderEducationPreview(education) {
    if (!education.length) {
      preview.education.innerHTML =
        '<p class="resume-body is-placeholder">' +
        escapeHtml(PLACEHOLDERS.education) +
        "</p>";
      return;
    }

    preview.education.innerHTML = education.map(formatEducationEntry).join("");
  }

  function renderSkillsPreview(skills) {
    preview.skills.replaceChildren();
    if (!skills.length) {
      const li = document.createElement("li");
      li.className = "skill-badges__placeholder";
      li.textContent = PLACEHOLDERS.skills;
      preview.skills.appendChild(li);
      return;
    }

    skills.forEach(function (skill) {
      const li = document.createElement("li");
      li.className = "skill-badge";
      li.textContent = skill;
      preview.skills.appendChild(li);
    });
  }

  function renderLanguagesPreview(languages) {
    preview.languages.replaceChildren();
    if (!languages.length) {
      const li = document.createElement("li");
      li.className = "language-list__placeholder";
      li.textContent = PLACEHOLDERS.languages;
      preview.languages.appendChild(li);
      return;
    }

    languages.forEach(function (entry) {
      const li = document.createElement("li");
      li.className = "language-item";
      const name = escapeHtml(entry.language);
      const level = escapeHtml(entry.proficiency);
      li.innerHTML =
        '<span class="language-item__name">' +
        name +
        "</span>" +
        (level
          ? '<span class="language-item__level">' + level + "</span>"
          : "");
      preview.languages.appendChild(li);
    });
  }

  function updateResume() {
    const data = getValues();

    preview.name.textContent = displayText(data.name, PLACEHOLDERS.name);
    preview.title.textContent = displayText(data.title, PLACEHOLDERS.title);
    preview.contact.textContent = displayText(data.contact, PLACEHOLDERS.contact);

    const summaryText = displayText(data.summary, PLACEHOLDERS.summary);
    preview.summary.textContent = summaryText;
    preview.summary.classList.toggle("is-placeholder", !data.summary);

    const expText = displayText(data.experience, PLACEHOLDERS.experience);
    preview.experience.textContent = expText;
    preview.experience.classList.toggle("is-placeholder", !data.experience);

    renderEducationPreview(data.education);
    renderSkillsPreview(data.skills);
    renderLanguagesPreview(data.languages);
    scheduleOverflowCheck();
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
      fields.summary.value = data.summary ?? "";
      fields.experience.value = data.experience ?? "";
      fields.skills.value = data.skills ?? "";

      const education = Array.isArray(data.education) ? data.education : [];
      const languages = Array.isArray(data.languages) ? data.languages : [];
      renderEducationList(education.length ? education : [EMPTY_EDUCATION]);
      renderLanguagesList(languages.length ? languages : [EMPTY_LANGUAGE]);

      applyFont(data.fontFamily ?? DEFAULT_FONT);
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
    fields.summary.value = "";
    fields.experience.value = "";
    fields.skills.value = "";
    renderEducationList([EMPTY_EDUCATION]);
    renderLanguagesList([EMPTY_LANGUAGE]);
    applyFont(DEFAULT_FONT);
    clearLocalStorage();
    updateResume();
  }

  function handleFontChange() {
    applyFont(fontSelect.value);
    saveToLocalStorage();
  }

  function handleEducationListClick(event) {
    const removeBtn = event.target.closest('[data-action="remove-education"]');
    if (!removeBtn) {
      return;
    }
    const cards = educationListEl.querySelectorAll(".repeatable-card");
    if (cards.length <= 1) {
      renderEducationList([EMPTY_EDUCATION]);
    } else {
      removeBtn.closest(".repeatable-card")?.remove();
      Array.from(educationListEl.querySelectorAll(".repeatable-card")).forEach(
        function (card, index) {
          card.dataset.index = String(index);
          const legend = card.querySelector(".repeatable-card__legend");
          if (legend) {
            legend.textContent = "School " + (index + 1);
          }
        }
      );
    }
    handleInput();
  }

  function handleLanguagesListClick(event) {
    const removeBtn = event.target.closest('[data-action="remove-language"]');
    if (!removeBtn) {
      return;
    }
    const cards = languagesListEl.querySelectorAll(".repeatable-card");
    if (cards.length <= 1) {
      renderLanguagesList([EMPTY_LANGUAGE]);
    } else {
      removeBtn.closest(".repeatable-card")?.remove();
      Array.from(languagesListEl.querySelectorAll(".repeatable-card")).forEach(
        function (card, index) {
          card.dataset.index = String(index);
          const legend = card.querySelector(".repeatable-card__legend");
          if (legend) {
            legend.textContent = "Language " + (index + 1);
          }
        }
      );
    }
    handleInput();
  }

  function sanitizeFilename(name) {
    const base = (name || "resume").replace(/[^\w\s-]/g, "").trim() || "resume";
    return base.replace(/\s+/g, "-").toLowerCase() + ".pdf";
  }

  function pdfEnsureSpace(doc, y, needed, marginTop, marginBottom, pageHeight) {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage();
      return marginTop;
    }
    return y;
  }

  function pdfAddSectionTitle(doc, title, marginX, y, pdfFont) {
    doc.setFont(pdfFont, "bold");
    doc.setFontSize(9);
    doc.setTextColor(26, 29, 35);
    doc.text(title, marginX, y);
    return y + 8;
  }

  function pdfAddWrappedText(doc, text, marginX, y, contentWidth, lineHeight, marginTop, marginBottom, pageHeight, pdfFont) {
    doc.setFont(pdfFont, "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(text, contentWidth);
    lines.forEach(function (line) {
      y = pdfEnsureSpace(doc, y, lineHeight, marginTop, marginBottom, pageHeight);
      doc.text(line, marginX, y);
      y += lineHeight;
    });
    return y;
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
    const lineHeight = 5.5;
    let y = marginTop;

    const name = displayText(data.name, PLACEHOLDERS.name);
    const title = displayText(data.title, PLACEHOLDERS.title);
    const contact = displayText(data.contact, PLACEHOLDERS.contact);
    const summary = data.summary;
    const experience = displayText(data.experience, PLACEHOLDERS.experience);
    const pdfFont = FONT_OPTIONS[getFontKey()].pdf;

    doc.setFont(pdfFont, "bold");
    doc.setFontSize(22);
    doc.text(name, marginX, y);
    y += 10;

    doc.setFont(pdfFont, "normal");
    doc.setFontSize(12);
    doc.setTextColor(80, 86, 96);
    doc.text(title, marginX, y);
    y += 7;

    doc.setFontSize(10);
    doc.text(contact, marginX, y);
    y += 6;

    if (summary) {
      y += 2;
      y = pdfAddWrappedText(
        doc,
        summary,
        marginX,
        y,
        contentWidth,
        lineHeight,
        marginTop,
        marginBottom,
        pageHeight,
        pdfFont
      );
      y += 4;
    }

    doc.setDrawColor(26, 29, 35);
    doc.setLineWidth(0.4);
    doc.line(marginX, y + 2, pageWidth - marginX, y + 2);
    y += 12;

    y = pdfAddSectionTitle(doc, "EXPERIENCE", marginX, y, pdfFont);
    y = pdfAddWrappedText(
      doc,
      experience,
      marginX,
      y,
      contentWidth,
      lineHeight,
      marginTop,
      marginBottom,
      pageHeight,
      pdfFont
    );
    y += 6;

    if (data.education.length) {
      y = pdfAddSectionTitle(doc, "EDUCATION", marginX, y, pdfFont);
      data.education.forEach(function (entry) {
        const e = normalizeEducation(entry);
        const headline = [e.school, [e.degree, e.field].filter(Boolean).join(", ")]
          .filter(Boolean)
          .join(" — ");
        if (headline) {
          doc.setFont(pdfFont, "bold");
          doc.setFontSize(10);
          y = pdfEnsureSpace(doc, y, lineHeight, marginTop, marginBottom, pageHeight);
          doc.text(headline, marginX, y);
          y += lineHeight;
        }
        if (e.graduationDate) {
          doc.setFont(pdfFont, "normal");
          doc.setFontSize(9);
          doc.setTextColor(92, 99, 112);
          y = pdfEnsureSpace(doc, y, lineHeight, marginTop, marginBottom, pageHeight);
          doc.text(e.graduationDate, marginX, y);
          y += lineHeight;
          doc.setTextColor(26, 29, 35);
        }
        if (e.certifications) {
          doc.setFont(pdfFont, "normal");
          doc.setFontSize(9);
          y = pdfAddWrappedText(
            doc,
            e.certifications,
            marginX,
            y,
            contentWidth,
            lineHeight,
            marginTop,
            marginBottom,
            pageHeight,
            pdfFont
          );
        }
        y += 2;
      });
      y += 4;
    }

    if (data.skills.length) {
      y = pdfAddSectionTitle(doc, "SKILLS", marginX, y, pdfFont);
      doc.setFont(pdfFont, "normal");
      doc.setFontSize(10);
      y = pdfEnsureSpace(doc, y, lineHeight, marginTop, marginBottom, pageHeight);
      doc.text(data.skills.join("  ·  "), marginX, y);
      y += lineHeight + 4;
    }

    if (data.languages.length) {
      y = pdfAddSectionTitle(doc, "LANGUAGES", marginX, y, pdfFont);
      doc.setFont(pdfFont, "normal");
      doc.setFontSize(10);
      const langLines = data.languages.map(function (entry) {
        const l = normalizeLanguage(entry);
        return l.proficiency ? l.language + " — " + l.proficiency : l.language;
      });
      y = pdfAddWrappedText(
        doc,
        langLines.join("\n"),
        marginX,
        y,
        contentWidth,
        lineHeight,
        marginTop,
        marginBottom,
        pageHeight,
        pdfFont
      );
    }

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
  fontSelect.addEventListener("change", handleFontChange);
  downloadBtn.addEventListener("click", downloadPdf);
  clearBtn.addEventListener("click", clearForm);
  addEducationBtn.addEventListener("click", function () {
    const entries = collectEducationFromDOM();
    entries.push(EMPTY_EDUCATION);
    renderEducationList(entries);
    handleInput();
  });
  addLanguageBtn.addEventListener("click", function () {
    const entries = collectLanguagesFromDOM();
    entries.push(EMPTY_LANGUAGE);
    renderLanguagesList(entries);
    handleInput();
  });
  educationListEl.addEventListener("click", handleEducationListClick);
  languagesListEl.addEventListener("click", handleLanguagesListClick);

  if (typeof ResizeObserver !== "undefined") {
    const overflowObserver = new ResizeObserver(scheduleOverflowCheck);
    overflowObserver.observe(resumePreview);
    overflowObserver.observe(resumePreviewContent);
  }

  window.addEventListener("resize", scheduleOverflowCheck);

  applyFont(DEFAULT_FONT);
  if (!loadFromLocalStorage()) {
    renderEducationList([EMPTY_EDUCATION]);
    renderLanguagesList([EMPTY_LANGUAGE]);
  }
  updateResume();
  scheduleOverflowCheck();
})();
