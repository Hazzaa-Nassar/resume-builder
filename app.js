/**
 * CV Maker — single-page resume editor.
 *
 * State sync pipeline (form → preview → localStorage):
 *   1. User edits #cv-form (static fields + repeatable cards in *-list containers).
 *   2. `handleInput` saves via `getRawValues()` and refreshes via `getValues()` + `updateResume()`.
 *   3. Repeatable sections use `collect*FromDOM()` → normalize → render preview / PDF.
 *
 * Draft shape (localStorage key: cv-maker-draft):
 *   name, title, contact, summary, skills (string), fontFamily,
 *   experience[] | education[] | languages[] (objects with data-field keys in HTML).
 */
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
    hobbies: "Add hobbies in the form",
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

  const EMPTY_EXPERIENCE = {
    company: "",
    role: "",
    startDate: "",
    endDate: "",
    description: "",
  };

  const form = document.getElementById("cv-form");
  const fields = {
    name: document.getElementById("name"),
    title: document.getElementById("title"),
    contact: document.getElementById("contact"),
    summary: document.getElementById("summary"),
    skills: document.getElementById("skills"),
    hobbies: document.getElementById("hobbies"),
  };

  const preview = {
    name: document.getElementById("preview-name"),
    title: document.getElementById("preview-title"),
    contact: document.getElementById("preview-contact"),
    summary: document.getElementById("preview-summary"),
    experience: document.getElementById("preview-experience"),
    education: document.getElementById("preview-education"),
    skills: document.getElementById("preview-skills"),
    hobbies: document.getElementById("preview-hobbies"),
    languages: document.getElementById("preview-languages"),
  };

  const experienceListEl = document.getElementById("experience-list");
  const educationListEl = document.getElementById("education-list");
  const languagesListEl = document.getElementById("languages-list");
  const addExperienceBtn = document.getElementById("add-experience-btn");
  const addEducationBtn = document.getElementById("add-education");
  const addLanguageBtn = document.getElementById("add-language");
  const downloadBtn = document.getElementById("download-pdf");
  const clearBtn = document.getElementById("clear-form");
  const fontSelect = document.getElementById("resume-font");
  const resumePreview = document.getElementById("resume-preview");
  const resumePreviewContent = document.getElementById("resume-preview-content");
  const previewStage = document.querySelector(".preview-stage");
  const a4ScaleViewport = document.getElementById("a4-scale-viewport");
  const a4ScaleSizer = document.getElementById("a4-scale-sizer");
  const overflowWarning = document.getElementById("page-overflow-warning");

  const A4_REF_WIDTH = 420;
  const A4_REF_HEIGHT = A4_REF_WIDTH * (297 / 210);

  let overflowRaf = 0;

  /** Startup check: logs missing nodes; does not throw (graceful degradation). */
  function assertDom() {
    const required = {
      form,
      experienceListEl,
      educationListEl,
      languagesListEl,
      addExperienceBtn,
      resumePreview,
      resumePreviewContent,
      "preview.experience": preview.experience,
    };
    Object.keys(required).forEach(function (key) {
      if (!required[key]) {
        console.error("CV Maker: missing required element —", key);
      }
    });
  }

  function getFontKey() {
    const key = fontSelect.value;
    return FONT_OPTIONS[key] ? key : DEFAULT_FONT;
  }

  function applyFont(fontKey) {
    const resolved = FONT_OPTIONS[fontKey] ? fontKey : DEFAULT_FONT;
    const { stack } = FONT_OPTIONS[resolved];
    if (fontSelect) {
      fontSelect.value = resolved;
    }
    if (resumePreview) {
      resumePreview.style.setProperty("--resume-font", stack);
    }
    scheduleOverflowCheck();
  }

  /** Fit reference A4 page to preview column via transform (layout size stays fixed for overflow math). */
  function updatePreviewScale() {
    if (!a4ScaleViewport || !resumePreview) {
      return;
    }

    const availW = a4ScaleViewport.clientWidth;
    const availH = a4ScaleViewport.clientHeight;
    if (availW <= 0) {
      return;
    }

    const scaleW = availW / A4_REF_WIDTH;
    const scaleH = availH > 0 ? availH / A4_REF_HEIGHT : scaleW;
    const scale = Math.min(scaleW, scaleH);
    const scaleValue = String(scale);

    document.documentElement.style.setProperty("--preview-scale", scaleValue);
    if (a4ScaleSizer) {
      a4ScaleSizer.style.setProperty("--preview-scale", scaleValue);
    }
    resumePreview.style.setProperty("--preview-scale", scaleValue);
  }

  function scheduleOverflowCheck() {
    if (overflowRaf) {
      cancelAnimationFrame(overflowRaf);
    }
    overflowRaf = requestAnimationFrame(function () {
      overflowRaf = 0;
      updatePreviewScale();
      checkPageOverflow();
    });
  }

  function checkPageOverflow() {
    if (!resumePreview || !resumePreviewContent) {
      return;
    }

    const pageHeight = resumePreview.clientHeight;
    const contentHeight = resumePreviewContent.scrollHeight;
    const pageOverflows = contentHeight > pageHeight + 1;
    const cutoffY = resumePreview.getBoundingClientRect().bottom;

    resumePreview.classList.toggle("is-overflowing", pageOverflows);
    if (overflowWarning) {
      overflowWarning.hidden = !pageOverflows;
    }

    const overflowTargets = resumePreviewContent.querySelectorAll(
      ".resume-header, .resume-summary, .resume-section, .resume-meta-row, .experience-entry, .education-entry"
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

  function normalizeExperience(entry) {
    return {
      company: (entry && entry.company) || "",
      role: (entry && entry.role) || "",
      startDate: (entry && entry.startDate) || "",
      endDate: (entry && entry.endDate) || "",
      description: (entry && entry.description) || "",
    };
  }

  /**
   * Load experience from draft. Supports current array format and legacy single-textarea
   * drafts (plain string → one job entry with description only).
   */
  function parseStoredExperience(value) {
    if (Array.isArray(value)) {
      return value.map(normalizeExperience);
    }
    if (typeof value === "string" && value.trim()) {
      return [normalizeExperience({ description: value.trim() })];
    }
    return [];
  }

  function formatExperienceDates(entry) {
    const job = normalizeExperience(entry);
    if (job.startDate && job.endDate) {
      return job.startDate + " – " + job.endDate;
    }
    return job.startDate || job.endDate || "";
  }

  function experienceHasContent(entry) {
    const job = normalizeExperience(entry);
    return Boolean(
      job.company ||
        job.role ||
        job.startDate ||
        job.endDate ||
        job.description
    );
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

  function collectExperienceFromDOM() {
    if (!experienceListEl) {
      return [];
    }
    return Array.from(experienceListEl.querySelectorAll(".repeatable-card")).map(
      function (card) {
        return normalizeExperience({
          company: card.querySelector('[data-field="company"]')?.value ?? "",
          role: card.querySelector('[data-field="role"]')?.value ?? "",
          startDate: card.querySelector('[data-field="startDate"]')?.value ?? "",
          endDate: card.querySelector('[data-field="endDate"]')?.value ?? "",
          description:
            card.querySelector('[data-field="description"]')?.value ?? "",
        });
      }
    );
  }

  function collectEducationFromDOM() {
    if (!educationListEl) {
      return [];
    }
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
    if (!languagesListEl) {
      return [];
    }
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

  function buildExperienceCard(entry, index) {
    const card = document.createElement("fieldset");
    card.className = "repeatable-card";
    card.dataset.index = String(index);
    card.innerHTML =
      '<legend class="repeatable-card__legend">Role ' +
      (index + 1) +
      '</legend>' +
      '<button type="button" class="repeatable-card__remove" data-action="remove-experience" aria-label="Remove this role">Remove</button>' +
      '<div class="repeatable-card__row">' +
      '<div class="field"><label>Company</label>' +
      '<input type="text" data-field="company" placeholder="Acme Corp" spellcheck="false" value="' +
      escapeHtml(entry.company) +
      '"></div>' +
      '<div class="field"><label>Role</label>' +
      '<input type="text" data-field="role" placeholder="Senior Designer" spellcheck="false" value="' +
      escapeHtml(entry.role) +
      '"></div>' +
      "</div>" +
      '<div class="repeatable-card__row">' +
      '<div class="field"><label>Start date</label>' +
      '<input type="text" data-field="startDate" placeholder="Jan 2020" spellcheck="false" value="' +
      escapeHtml(entry.startDate) +
      '"></div>' +
      '<div class="field"><label>End date</label>' +
      '<input type="text" data-field="endDate" placeholder="Present" spellcheck="false" value="' +
      escapeHtml(entry.endDate) +
      '"></div>' +
      "</div>" +
      '<div class="field"><label>Description</label>' +
      '<textarea data-field="description" rows="4" placeholder="• Led cross-functional teams&#10;• Delivered measurable outcomes">' +
      escapeHtml(entry.description) +
      "</textarea></div>";
    return card;
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

  function renderExperienceList(entries) {
    if (!experienceListEl) {
      return;
    }
    const list =
      entries && entries.length ? entries.map(normalizeExperience) : [EMPTY_EXPERIENCE];
    experienceListEl.replaceChildren();
    list.forEach(function (entry, index) {
      experienceListEl.appendChild(buildExperienceCard(entry, index));
    });
  }

  function renderEducationList(entries) {
    if (!educationListEl) {
      return;
    }
    const list =
      entries && entries.length ? entries.map(normalizeEducation) : [EMPTY_EDUCATION];
    educationListEl.replaceChildren();
    list.forEach(function (entry, index) {
      educationListEl.appendChild(buildEducationCard(entry, index));
    });
  }

  function renderLanguagesList(entries) {
    if (!languagesListEl) {
      return;
    }
    const list =
      entries && entries.length ? entries.map(normalizeLanguage) : [EMPTY_LANGUAGE];
    languagesListEl.replaceChildren();
    list.forEach(function (entry, index) {
      languagesListEl.appendChild(buildLanguageCard(entry, index));
    });
  }

  function formatExperienceEntry(entry) {
    const job = normalizeExperience(entry);
    const parts = [];

    if (job.role) {
      parts.push('<p class="experience-entry__role">' + escapeHtml(job.role) + "</p>");
    }
    if (job.company) {
      parts.push(
        '<p class="experience-entry__company">' + escapeHtml(job.company) + "</p>"
      );
    }
    const dates = formatExperienceDates(job);
    if (dates) {
      parts.push('<p class="experience-entry__dates">' + escapeHtml(dates) + "</p>");
    }
    if (job.description) {
      parts.push(
        '<p class="experience-entry__description">' +
          escapeHtml(job.description) +
          "</p>"
      );
    }
    return parts.length ? '<div class="experience-entry">' + parts.join("") + "</div>" : "";
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

  /** Trimmed, display-ready data (repeatable rows omit empty cards). */
  function getValues() {
    const experience = collectExperienceFromDOM().filter(experienceHasContent);
    const education = collectEducationFromDOM().filter(educationHasContent);
    const languages = collectLanguagesFromDOM().filter(languageHasContent);

    return {
      name: (fields.name?.value ?? "").trim(),
      title: (fields.title?.value ?? "").trim(),
      contact: (fields.contact?.value ?? "").trim(),
      summary: (fields.summary?.value ?? "").trim(),
      experience: experience,
      education: education,
      skills: parseSkills(fields.skills?.value ?? ""),
      hobbies: parseSkills(fields.hobbies?.value ?? ""),
      languages: languages,
    };
  }

  /** Exact form state for persistence (includes blank repeatable cards). */
  function getRawValues() {
    return {
      name: fields.name?.value ?? "",
      title: fields.title?.value ?? "",
      contact: fields.contact?.value ?? "",
      summary: fields.summary?.value ?? "",
      experience: collectExperienceFromDOM(),
      education: collectEducationFromDOM(),
      skills: fields.skills?.value ?? "",
      hobbies: fields.hobbies?.value ?? "",
      languages: collectLanguagesFromDOM(),
      fontFamily: getFontKey(),
    };
  }

  function renderExperiencePreview(experience) {
    if (!preview.experience) {
      return;
    }
    if (!experience.length) {
      preview.experience.innerHTML =
        '<p class="resume-body is-placeholder">' +
        escapeHtml(PLACEHOLDERS.experience) +
        "</p>";
      return;
    }

    preview.experience.innerHTML = experience.map(formatExperienceEntry).join("");
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

  function renderHobbiesPreview(hobbies) {
    preview.hobbies.replaceChildren();
    if (!hobbies.length) {
      const li = document.createElement("li");
      li.className = "skill-badges__placeholder";
      li.textContent = PLACEHOLDERS.hobbies;
      preview.hobbies.appendChild(li);
      return;
    }

    hobbies.forEach(function (hobby) {
      const li = document.createElement("li");
      li.className = "skill-badge";
      li.textContent = hobby;
      preview.hobbies.appendChild(li);
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

    if (!preview.name || !preview.title || !preview.contact || !preview.summary) {
      return;
    }

    preview.name.textContent = displayText(data.name, PLACEHOLDERS.name);
    preview.title.textContent = displayText(data.title, PLACEHOLDERS.title);
    preview.contact.textContent = displayText(data.contact, PLACEHOLDERS.contact);

    const summaryText = displayText(data.summary, PLACEHOLDERS.summary);
    preview.summary.textContent = summaryText;
    preview.summary.classList.toggle("is-placeholder", !data.summary);

    renderExperiencePreview(data.experience);
    renderEducationPreview(data.education);
    renderSkillsPreview(data.skills);
    renderHobbiesPreview(data.hobbies);
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
      fields.skills.value =
        typeof data.skills === "string" ? data.skills : "";
      fields.hobbies.value =
        typeof data.hobbies === "string" ? data.hobbies : "";

      const experience = parseStoredExperience(data.experience);
      const education = Array.isArray(data.education)
        ? data.education.map(normalizeEducation)
        : [];
      const languages = Array.isArray(data.languages)
        ? data.languages.map(normalizeLanguage)
        : [];
      renderExperienceList(experience.length ? experience : [EMPTY_EXPERIENCE]);
      renderEducationList(education.length ? education : [EMPTY_EDUCATION]);
      renderLanguagesList(languages.length ? languages : [EMPTY_LANGUAGE]);

      applyFont(data.fontFamily ?? DEFAULT_FONT);
      updateResume();
      return true;
    } catch (err) {
      console.warn("Could not load draft:", err);
      return false;
    }
  }

  function clearLocalStorage() {
    localStorage.removeItem(STORAGE_KEY);
  }

  /** Central sync: every form `input` event (bubbled from dynamic cards) runs this. */
  function handleInput() {
    saveToLocalStorage();
    updateResume();
  }

  function clearForm() {
    fields.name.value = "";
    fields.title.value = "";
    fields.contact.value = "";
    fields.summary.value = "";
    fields.skills.value = "";
    fields.hobbies.value = "";
    renderExperienceList([EMPTY_EXPERIENCE]);
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

  function handleExperienceListClick(event) {
    if (!experienceListEl) {
      return;
    }
    const removeBtn = event.target.closest('[data-action="remove-experience"]');
    if (!removeBtn) {
      return;
    }
    const cards = experienceListEl.querySelectorAll(".repeatable-card");
    if (cards.length <= 1) {
      renderExperienceList([EMPTY_EXPERIENCE]);
    } else {
      removeBtn.closest(".repeatable-card")?.remove();
      Array.from(experienceListEl.querySelectorAll(".repeatable-card")).forEach(
        function (card, index) {
          card.dataset.index = String(index);
          const legend = card.querySelector(".repeatable-card__legend");
          if (legend) {
            legend.textContent = "Role " + (index + 1);
          }
        }
      );
    }
    handleInput();
  }

  function handleEducationListClick(event) {
    if (!educationListEl) {
      return;
    }
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
    if (!languagesListEl) {
      return;
    }
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

    if (data.experience.length) {
      y = pdfAddSectionTitle(doc, "EXPERIENCE", marginX, y, pdfFont);
      data.experience.forEach(function (entry) {
        const job = normalizeExperience(entry);
        const headline = [job.role, job.company].filter(Boolean).join(" — ");
        const dates = formatExperienceDates(job);

        if (headline) {
          doc.setFont(pdfFont, "bold");
          doc.setFontSize(10);
          doc.setTextColor(26, 29, 35);
          y = pdfEnsureSpace(doc, y, lineHeight, marginTop, marginBottom, pageHeight);
          doc.text(headline, marginX, y);
          y += lineHeight;
        }
        if (dates) {
          doc.setFont(pdfFont, "normal");
          doc.setFontSize(9);
          doc.setTextColor(92, 99, 112);
          y = pdfEnsureSpace(doc, y, lineHeight, marginTop, marginBottom, pageHeight);
          doc.text(dates, marginX, y);
          y += lineHeight;
          doc.setTextColor(26, 29, 35);
        }
        if (job.description) {
          y = pdfAddWrappedText(
            doc,
            job.description,
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

      y = pdfAddWrappedText(
        doc,
        data.skills.join("  ·  "),
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

    if (data.hobbies.length) {
      y = pdfAddSectionTitle(doc, "HOBBIES & INTERESTS", marginX, y, pdfFont);

      y = pdfAddWrappedText(
        doc,
        data.hobbies.join("  ·  "),
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

  // --- Init: validate DOM, bind events, restore draft or empty repeatable rows ---
  assertDom();

  if (form) {
    form.addEventListener("input", handleInput);
  }
  if (fontSelect) {
    fontSelect.addEventListener("change", handleFontChange);
  }
  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadPdf);
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", clearForm);
  }
  if (addExperienceBtn) {
    addExperienceBtn.addEventListener("click", function () {
      const entries = collectExperienceFromDOM();
      entries.push({ ...EMPTY_EXPERIENCE });
      renderExperienceList(entries);
      handleInput();
    });
  }
  if (experienceListEl) {
    experienceListEl.addEventListener("click", handleExperienceListClick);
  }
  if (addEducationBtn) {
    addEducationBtn.addEventListener("click", function () {
      const entries = collectEducationFromDOM();
      entries.push({ ...EMPTY_EDUCATION });
      renderEducationList(entries);
      handleInput();
    });
  }
  if (addLanguageBtn) {
    addLanguageBtn.addEventListener("click", function () {
      const entries = collectLanguagesFromDOM();
      entries.push({ ...EMPTY_LANGUAGE });
      renderLanguagesList(entries);
      handleInput();
    });
  }
  if (educationListEl) {
    educationListEl.addEventListener("click", handleEducationListClick);
  }
  if (languagesListEl) {
    languagesListEl.addEventListener("click", handleLanguagesListClick);
  }

  if (typeof ResizeObserver !== "undefined") {
    const overflowObserver = new ResizeObserver(scheduleOverflowCheck);
    if (a4ScaleViewport) {
      overflowObserver.observe(a4ScaleViewport);
    }
    if (previewStage) {
      overflowObserver.observe(previewStage);
    }
    if (resumePreview) {
      overflowObserver.observe(resumePreview);
    }
    if (resumePreviewContent) {
      overflowObserver.observe(resumePreviewContent);
    }
    if (experienceListEl) {
      overflowObserver.observe(experienceListEl);
    }
  }

  window.addEventListener("resize", scheduleOverflowCheck);

  applyFont(DEFAULT_FONT);
  if (!loadFromLocalStorage()) {
    renderExperienceList([EMPTY_EXPERIENCE]);
    renderEducationList([EMPTY_EDUCATION]);
    renderLanguagesList([EMPTY_LANGUAGE]);
  }
  updatePreviewScale();
  updateResume();
  scheduleOverflowCheck();
})();
