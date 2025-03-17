let selectedFile = null;
let shifts = [];
let holidays = [];
let isEditMode = false;

// Toggle visibility of generate and edit buttons based on file selection
function updateButtonState() {
    const generateButton = document.getElementById("generateButton");
    const editButton = document.getElementById("editButton");
    if (selectedFile) {
        generateButton.classList.remove("hidden");
        editButton.classList.remove("hidden");
    } else {
        generateButton.classList.add("hidden");
        editButton.classList.add("hidden");
    }
}

// Handle file input selection
function handleFileSelect(event) {
    selectedFile = event.target.files[0];
    updateButtonState();
    processFile();
}

// Handle file drop event
function handleDrop(event) {
    event.preventDefault();
    document.getElementById("dropZone").classList.remove("dragover");
    selectedFile = event.dataTransfer.files[0];
    updateButtonState();
    processFile();
}

// Add drag-over styling
function handleDragOver(event) {
    event.preventDefault();
    document.getElementById("dropZone").classList.add("dragover");
}

// Remove drag-over styling
function handleDragLeave(event) {
    event.preventDefault();
    document.getElementById("dropZone").classList.remove("dragover");
}

// Process uploaded PDF and extract shifts/holidays
async function processFile() {
    const status = document.getElementById("status");
    const statusText = document.getElementById("statusText");
    const spinner = document.getElementById("spinner");
    const preview = document.getElementById("preview");
    const previewTable = document.getElementById("previewTable");
    const defaultReminder = document.getElementById("reminder").value;

    // Reset UI state
    status.classList.remove("success", "error");
    statusText.textContent = "Käsitellään tiedostoa...";
    spinner.style.display = "inline-block";
    preview.classList.add("hidden");
    previewTable.innerHTML = "";

    if (!selectedFile) {
        statusText.textContent = "Valitse PDF-tiedosto ensin!";
        status.classList.add("error");
        spinner.style.display = "none";
        return;
    }

    try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            text += textContent.items.map(item => item.str).join(" ") + "\n";
        }

        // Determine date range for year assignment
        let startYear, endYear;
        const dateRangeMatch = text.match(/(\d{1,2}\.\d{1,2}\.\d{4})\s*[-–—]\s*(\d{1,2}\.\d{1,2}\.\d{4})/);
        if (dateRangeMatch) {
            const startDate = dateRangeMatch[1].split(".").reverse().join("");
            const endDate = dateRangeMatch[2].split(".").reverse().join("");
            startYear = startDate.slice(0, 4);
            endYear = endDate.slice(0, 4);
        } else {
            const range = prompt("Päivämääräaluetta ei löydy PDF:stä. Syötä alue (esim. 3.3.2025 - 23.3.2025):");
            if (!range || !range.match(/(\d{1,2}\.\d{1,2}\.\d{4})\s*-\s*(\d{1,2}\.\d{1,2}\.\d{4})/)) {
                statusText.textContent = "Virheellinen päivämääräalue!";
                status.classList.add("error");
                spinner.style.display = "none";
                return;
            }
            const [start, end] = range.split(" - ");
            startYear = start.split(".").reverse().join("").slice(0, 4);
            endYear = end.split(".").reverse().join("").slice(0, 4);
        }

        shifts = [];
        holidays = [];
        const shiftPattern = /(\d{1,2}\.\d{1,2})\s+(?:(\d{02}:\d{2}\s*-\s*\d{02}:\d{2})\s+)?(.+?)(?=\d{1,2}\.\d{1,2}|Tulostettu|$)/gi;
        let match;
        while ((match = shiftPattern.exec(text)) !== null) {
            const [_, dateStr, timeRange, descRaw] = match;
            const [day, month] = dateStr.split(".");
            const year = parseInt(month) <= 3 && parseInt(month) >= 1 ? endYear : startYear;
            const date = `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}`;

            let desc = descRaw.trim().replace(/Liikenteenohjauskeskus\s*\.{3}/i, "").replace(/\s+/g, " ").trim();
            desc = desc.replace(/\d{1,2}:\d{2}\s*(Viikkotunnit)?/gi, "").trim();

            if (timeRange) {
                const [startTime, endTime] = timeRange.split("-").map(t => t.trim().replace(" ", ""));
                shifts.push({ date, startTime, endTime, desc, reminder: defaultReminder || "" });
            } else if (desc.toLowerCase().includes("loma")) {
                holidays.push({ date, desc });
            }
        }

        if (!shifts.length && !holidays.length) {
            statusText.textContent = "Ei työvuoroja tai lomia löydetty PDF:stä!";
            status.classList.add("error");
            spinner.style.display = "none";
            return;
        }

        // Increment ICS counter on successful PDF upload
        const { db, doc, getDoc, setDoc, updateDoc, increment } = window.firestore;
        const icsRef = doc(db, "counters", "icsCount");
        const icsSnap = await getDoc(icsRef);
        if (icsSnap.exists()) {
            await updateDoc(icsRef, { count: increment(1) });
        } else {
            await setDoc(icsRef, { count: 1 });
        }
        const updatedIcsSnap = await getDoc(icsRef);
        document.getElementById("icsCounter").textContent = `ics: ${updatedIcsSnap.data().count}`;

        renderPreview();
        preview.classList.remove("hidden");
        statusText.textContent = "Tiedosto käsitelty. Tarkista esikatselu ja lataa kalenterimerkintä.";
        status.classList.add("success");
        spinner.style.display = "none";

    } catch (error) {
        statusText.textContent = `Virhe tapahtui: ${error.message}`;
        status.classList.add("error");
        spinner.style.display = "none";
        console.error(error);
    }
}

// Render shifts and holidays in the preview table
function renderPreview() {
    const previewTable = document.getElementById("previewTable");
    previewTable.innerHTML = "";

    shifts.forEach((shift, index) => {
        const dateFormatted = `${shift.date.slice(6,8)}.${shift.date.slice(4,6)}.${shift.date.slice(0,4)}`;
        const dateInput = `${shift.date.slice(0,4)}-${shift.date.slice(4,6)}-${shift.date.slice(6,8)}`;
        const row = document.createElement("tr");
        row.innerHTML = `
            <td class="date-cell" data-label="Päivämäärä">
                <div class="date-content">
                    ${isEditMode ? `<input type="date" class="editable" value="${dateInput}" data-index="${index}" data-type="shift" data-field="date">` : dateFormatted}
                </div>
                <button class="remove-btn ${isEditMode ? '' : 'hidden'}" onclick="removeRow(event, ${index}, 'shift')"><i class="fas fa-times"></i></button>
            </td>
            <td data-label="Aika">
                ${isEditMode ? 
                    `<input type="time" class="editable" value="${shift.startTime}" data-index="${index}" data-type="shift" data-field="startTime"> - 
                     <input type="time" class="editable" value="${shift.endTime}" data-index="${index}" data-type="shift" data-field="endTime">` : 
                    `${shift.startTime} - ${shift.endTime}`}
                <div class="reminder-field ${isEditMode ? '' : 'hidden'}">
                    Muistutus(min): <input type="number" class="editable" value="${shift.reminder || ''}" placeholder="Ei asetettu" data-index="${index}" data-type="shift" data-field="reminder">
                </div>
            </td>
            <td data-label="Kuvaus">
                ${isEditMode ? `<textarea class="editable" data-index="${index}" data-type="shift" data-field="desc">${shift.desc}</textarea>` : shift.desc}
            </td>`;
        previewTable.appendChild(row);
    });

    holidays.forEach((holiday, index) => {
        const dateFormatted = `${holiday.date.slice(6,8)}.${holiday.date.slice(4,6)}.${holiday.date.slice(0,4)}`;
        const dateInput = `${holiday.date.slice(0,4)}-${holiday.date.slice(4,6)}-${holiday.date.slice(6,8)}`;
        const row = document.createElement("tr");
        row.innerHTML = `
            <td class="date-cell" data-label="Päivämäärä">
                <div class="date-content">
                    ${isEditMode ? `<input type="date" class="editable" value="${dateInput}" data-index="${index}" data-type="holiday" data-field="date">` : dateFormatted}
                </div>
                <button class="remove-btn ${isEditMode ? '' : 'hidden'}" onclick="removeRow(event, ${index}, 'holiday')"><i class="fas fa-times"></i></button>
            </td>
            <td data-label="Aika">Koko päivä</td>
            <td data-label="Kuvaus">
                ${isEditMode ? `<textarea class="editable" data-index="${index}" data-type="holiday" data-field="desc">${holiday.desc}</textarea>` : holiday.desc}
            </td>`;
        previewTable.appendChild(row);
    });
}

// Toggle edit mode for preview table
function toggleEditMode() {
    isEditMode = !isEditMode;
    const editButton = document.getElementById("editButton");
    const saveChangesButton = document.getElementById("saveChangesButton");
    editButton.innerHTML = isEditMode ? '<i class="fas fa-times"></i> Peruuta' : '<i class="fas fa-edit"></i> Muokkaa';
    saveChangesButton.classList.toggle("hidden", !isEditMode);
    renderPreview();
}

// Save edited changes to shifts and holidays
function saveChanges() {
    document.querySelectorAll("[data-index]").forEach(element => {
        const index = parseInt(element.dataset.index);
        const type = element.dataset.type;
        const field = element.dataset.field;
        let value = element.value.trim();

        if (type === "shift") {
            if (field === "date") {
                value = value.replace(/-/g, "");
            }
            shifts[index][field] = value;
        } else if (type === "holiday") {
            if (field === "date") {
                value = value.replace(/-/g, "");
            }
            holidays[index][field] = value;
        }
    });
    isEditMode = false;
    toggleEditMode();
}

// Remove a row from the preview table
function removeRow(event, index, type) {
    event.stopPropagation();
    if (type === "shift") {
        shifts.splice(index, 1);
    } else if (type === "holiday") {
        holidays.splice(index, 1);
    }
    renderPreview();
}

// Generate and download ICS file
async function generateICS() {
    const status = document.getElementById("status");
    const statusText = document.getElementById("statusText");
    const spinner = document.getElementById("spinner");

    if (!shifts.length && !holidays.length) {
        statusText.textContent = "Ei tapahtumia tallennettavaksi!";
        status.classList.add("error");
        return;
    }

    status.classList.remove("success", "error");
    statusText.textContent = "Luodaan ICS-tiedostoa...";
    spinner.style.display = "inline-block";

    try {
        let icsContent = "BEGIN:VCALENDAR\r\n" +
                        "VERSION:2.0\r\n" +
                        "PRODID:-//Make//TyovuoroWeb//FI\r\n";

        shifts.forEach((shift, index) => {
            const start = `${shift.date}T${shift.startTime.replace(":", "")}00`;
            let endDate = shift.date;
            if (shift.startTime.startsWith("19")) {
                const dateObj = new Date(`${shift.date.slice(0,4)}-${shift.date.slice(4,6)}-${shift.date.slice(6,8)}`);
                dateObj.setDate(dateObj.getDate() + 1);
                endDate = `${dateObj.getFullYear()}${String(dateObj.getMonth() + 1).padStart(2, "0")}${String(dateObj.getDate()).padStart(2, "0")}`;
            }
            const end = `${endDate}T${shift.endTime.replace(":", "")}00`;
            const uid = `${start}Z-${String(index + 1).padStart(3, "0")}@make`;

            icsContent += "BEGIN:VEVENT\r\n" +
                          `SUMMARY:Työvuoro - ${shift.desc}\r\n` +
                          `DTSTART:${start}\r\n` +
                          `DTEND:${end}\r\n` +
                          `UID:${uid}\r\n` +
                          "DESCRIPTION:\r\n";
            if (shift.reminder !== "" && shift.reminder !== "Ei asetettu" && shift.reminder >= 0) {
                icsContent += `BEGIN:VALARM\r\n` +
                              `TRIGGER:-PT${shift.reminder}M\r\n` +
                              `ACTION:DISPLAY\r\n` +
                              `DESCRIPTION:Muistutus\r\n` +
                              `END:VALARM\r\n`;
            }
            icsContent += "END:VEVENT\r\n";
        });

        holidays.forEach((holiday, index) => {
            const uid = `${holiday.date}T000000Z-${String(shifts.length + index + 1).padStart(3, "0")}@make`;
            icsContent += "BEGIN:VEVENT\r\n" +
                          `SUMMARY:${holiday.desc}\r\n` +
                          `DTSTART;VALUE=DATE:${holiday.date}\r\n` +
                          `DTEND;VALUE=DATE:${parseInt(holiday.date) + 1}\r\n` +
                          `UID:${uid}\r\n` +
                          "DESCRIPTION:\r\n" +
                          "TRANSP:TRANSPARENT\r\n" +
                          "END:VEVENT\r\n";
        });

        icsContent += "END:VCALENDAR\r\n";

        const icsFile = new File([icsContent], "tyovuorot.ics", { type: "text/calendar" });
        const url = URL.createObjectURL(icsFile);
        const link = document.createElement("a");
        link.href = url;
        link.download = "tyovuorot.ics";
        link.click();
        URL.revokeObjectURL(url);

        statusText.textContent = "ICS-tiedosto on ladattu! Lisää se kalenteriin.";
        status.classList.add("success");
        spinner.style.display = "none";
    } catch (error) {
        statusText.textContent = `Virhe tapahtui: ${error.message}`;
        status.classList.add("error");
        spinner.style.display = "none";
        console.error(error);
    }
}

// Attach event listeners for drag-and-drop functionality
document.getElementById("dropZone").addEventListener("dragover", handleDragOver);
document.getElementById("dropZone").addEventListener("dragleave", handleDragLeave);
document.getElementById("dropZone").addEventListener("drop", handleDrop);
updateButtonState();