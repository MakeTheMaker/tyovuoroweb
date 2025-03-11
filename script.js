let selectedFile = null;
let shifts = []; // Global array for shifts
let holidays = []; // Global array for holidays

function updateButtonState() {
    const generateButton = document.getElementById("generateButton");
    if (selectedFile) {
        generateButton.classList.remove("hidden");
    } else {
        generateButton.classList.add("hidden");
    }
}

function handleFileSelect(event) {
    selectedFile = event.target.files[0];
    updateButtonState();
    processFile();
}

function handleDrop(event) {
    event.preventDefault();
    document.getElementById("dropZone").classList.remove("dragover");
    selectedFile = event.dataTransfer.files[0];
    updateButtonState();
    processFile();
}

function handleDragOver(event) {
    event.preventDefault();
    document.getElementById("dropZone").classList.add("dragover");
}

function handleDragLeave(event) {
    event.preventDefault();
    document.getElementById("dropZone").classList.remove("dragover");
}

// Helper function to format date for input type="date" (YYYY-MM-DD)
function formatDate(dateStr) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

// Toggle input field editability
function setInputsDisabled(disabled) {
    const inputs = document.querySelectorAll("#previewTable input");
    inputs.forEach(input => {
        input.disabled = disabled;
    });
}

// Delete a row from the table and update the data arrays
function deleteRow(button) {
    const row = button.closest("tr");
    const type = row.getAttribute("data-type");
    const index = parseInt(row.getAttribute("data-index"));
    if (type === "shift") {
        shifts.splice(index, 1);
    } else if (type === "holiday") {
        holidays.splice(index, 1);
    }
    row.remove();
    updateTableIndices(); // Update indices after deletion
}

// Update data-index attributes after deletion
function updateTableIndices() {
    const rows = document.querySelectorAll("#previewTable tr");
    rows.forEach((row, newIndex) => {
        row.setAttribute("data-index", newIndex);
    });
}

// Save changes from input fields to global arrays
function saveChanges() {
    const rows = document.querySelectorAll("#previewTable tr");
    rows.forEach(row => {
        const type = row.getAttribute("data-type");
        const index = parseInt(row.getAttribute("data-index"));
        if (type === "shift") {
            const dateInput = row.querySelector("td:nth-child(1) input");
            const startTimeInput = row.querySelector("td:nth-child(2) input[type='time']:first-child");
            const endTimeInput = row.querySelector("td:nth-child(2) input[type='time']:last-child");
            const descInput = row.querySelector("td:nth-child(3) input");
            const alarmInput = row.querySelector("td:nth-child(4) input");
            shifts[index].date = dateInput.value.replace(/-/g, "");
            shifts[index].startTime = startTimeInput.value;
            shifts[index].endTime = endTimeInput.value;
            shifts[index].desc = descInput.value;
            shifts[index].alarm = alarmInput.value;
        } else if (type === "holiday") {
            const dateInput = row.querySelector("td:nth-child(1) input");
            const descInput = row.querySelector("td:nth-child(3) input");
            const alarmInput = row.querySelector("td:nth-child(4) input");
            holidays[index].date = dateInput.value.replace(/-/g, "");
            holidays[index].desc = descInput.value;
            holidays[index].alarm = alarmInput.value;
        }
    });
    setInputsDisabled(true);
    document.getElementById("statusText").textContent = "Muutokset tallennettu. Voit ladata kalenteritiedoston.";
    document.getElementById("saveChangesButton").classList.add("hidden");
}

async function processFile() {
    const status = document.getElementById("status");
    const statusText = document.getElementById("statusText");
    const spinner = document.getElementById("spinner");
    const preview = document.getElementById("preview");
    const previewTable = document.getElementById("previewTable");

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
        const shiftPattern = /(\d{1,2}\.\d{1,2})\s+(?:(\d{2}:\d{2}\s*-\s*\d{2}:\d{2})\s+)?(.+?)(?=\d{1,2}\.\d{1,2}|Tulostettu|$)/gi;
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
                shifts.push({ date, startTime, endTime, desc, alarm: "" });
            } else if (desc.toLowerCase().includes("loma")) {
                holidays.push({ date, desc, alarm: "" });
            }
        }

        if (!shifts.length && !holidays.length) {
            statusText.textContent = "Ei työvuoroja tai lomia löydetty PDF:stä!";
            status.classList.add("error");
            spinner.style.display = "none";
            return;
        }

        shifts.forEach((shift, index) => {
            const row = document.createElement("tr");
            row.setAttribute("data-type", "shift");
            row.setAttribute("data-index", index);
            row.innerHTML = `
                <td><input type="date" value="${formatDate(shift.date)}" disabled></td>
                <td>
                    <input type="time" value="${shift.startTime}" disabled> - 
                    <input type="time" value="${shift.endTime}" disabled>
                </td>
                <td><input type="text" value="${shift.desc}" disabled></td>
                <td><input type="number" min="0" step="1" value="${shift.alarm}" disabled></td>
                <td><button class="delete-button" onclick="deleteRow(this)">Poista</button></td>
            `;
            previewTable.appendChild(row);
        });

        holidays.forEach((holiday, index) => {
            const row = document.createElement("tr");
            row.setAttribute("data-type", "holiday");
            row.setAttribute("data-index", index);
            row.innerHTML = `
                <td><input type="date" value="${formatDate(holiday.date)}" disabled></td>
                <td>Koko päivä</td>
                <td><input type="text" value="${holiday.desc}" disabled></td>
                <td><input type="number" min="0" step="1" value="${holiday.alarm}" disabled></td>
                <td><button class="delete-button" onclick="deleteRow(this)">Poista</button></td>
            `;
            previewTable.appendChild(row);
        });

        preview.classList.remove("hidden");
        statusText.textContent = "Tiedosto käsitelty. Voit muokata tietoja esikatselussa ennen kalenteritiedoston lataamista.";
        spinner.style.display = "none";
    } catch (error) {
        statusText.textContent = `Virhe tapahtui: ${error.message}`;
        status.classList.add("error");
        spinner.style.display = "none";
        console.error(error);
    }
}

async function generateICS() {
    const status = document.getElementById("status");
    const statusText = document.getElementById("statusText");
    const spinner = document.getElementById("spinner");
    const defaultReminder = document.getElementById("reminder").value;

    if (!selectedFile) {
        statusText.textContent = "Valitse PDF-tiedosto ensin!";
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
            const alarm = shift.alarm !== "" ? shift.alarm : defaultReminder;

            icsContent += "BEGIN:VEVENT\r\n" +
                          `SUMMARY:Työvuoro - ${shift.desc}\r\n` +
                          `DTSTART:${start}\r\n` +
                          `DTEND:${end}\r\n` +
                          `UID:${uid}\r\n` +
                          "DESCRIPTION:\r\n";
            if (alarm !== "" && alarm >= 0) {
                icsContent += `BEGIN:VALARM\r\n` +
                              `TRIGGER:-PT${alarm}M\r\n` +
                              `ACTION:DISPLAY\r\n` +
                              `DESCRIPTION:Muistutus\r\n` +
                              `END:VALARM\r\n`;
            }
            icsContent += "END:VEVENT\r\n";
        });

        holidays.forEach((holiday, index) => {
            const uid = `${holiday.date}T000000Z-${String(shifts.length + index + 1).padStart(3, "0")}@make`;
            const alarm = holiday.alarm !== "" ? holiday.alarm : defaultReminder;

            icsContent += "BEGIN:VEVENT\r\n" +
                          `SUMMARY:${holiday.desc}\r\n` +
                          `DTSTART;VALUE=DATE:${holiday.date}\r\n` +
                          `DTEND;VALUE=DATE:${parseInt(holiday.date) + 1}\r\n` +
                          `UID:${uid}\r\n` +
                          "DESCRIPTION:\r\n" +
                          "TRANSP:TRANSPARENT\r\n";
            if (alarm !== "" && alarm >= 0) {
                icsContent += `BEGIN:VALARM\r\n` +
                              `TRIGGER:-PT${alarm}M\r\n` +
                              `ACTION:DISPLAY\r\n` +
                              `DESCRIPTION:Muistutus\r\n` +
                              `END:VALARM\r\n`;
            }
            icsContent += "END:VEVENT\r\n";
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

// Event listeners
document.getElementById("dropZone").addEventListener("dragover", handleDragOver);
document.getElementById("dropZone").addEventListener("dragleave", handleDragLeave);
document.getElementById("dropZone").addEventListener("drop", handleDrop);
document.getElementById("editButton").addEventListener("click", () => {
    setInputsDisabled(false);
    document.getElementById("saveChangesButton").classList.remove("hidden");
});
document.getElementById("saveChangesButton").addEventListener("click", saveChanges);
updateButtonState();