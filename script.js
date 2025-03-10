let selectedFile = null;
let icsBlob = null;

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

    const shifts = [];
    const holidays = [];
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
        shifts.push({ date, startTime, endTime, desc });
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

    shifts.forEach(shift => {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${shift.date.slice(6,8)}.${shift.date.slice(4,6)}.${shift.date.slice(0,4)}</td>
                       <td>${shift.startTime} - ${shift.endTime}</td>
                       <td>${shift.desc}</td>`;
      previewTable.appendChild(row);
    });

    holidays.forEach(holiday => {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${holiday.date.slice(6,8)}.${holiday.date.slice(4,6)}.${shift.date.slice(0,4)}</td>
                       <td>Koko päivä</td>
                       <td>${holiday.desc}</td>`;
      previewTable.appendChild(row);
    });

    preview.classList.remove("hidden");
    statusText.textContent = "Tiedosto käsitelty. Tarkista esikatselu ja lataa kalenterimerkintä.";
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
  const reminder = document.getElementById("reminder").value;

  if (!selectedFile) {
    statusText.textContent = "Valitse PDF-tiedosto ensin!";
    status.classList.add("error");
    return;
  }

  status.classList.remove("success", "error");
  statusText.textContent = "Luodaan ICS-tiedostoa...";
  spinner.style.display = "inline-block";

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
      startYear = dateRangeMatch[1].split(".").reverse().join("").slice(0, 4);
      endYear = dateRangeMatch[2].split(".").reverse().join("").slice(0, 4);
    } else {
      const range = prompt("Päivämääräaluetta ei löydy PDF:stä. Syötä alue (esim. 3.3.2025 - 23.3.2025):");
      if (!range || !range.match(/(\d{1,2}\.\d{1,2}\.\d{4})\s*-\s*(\d{1,2}\.\d{1,2}\.\d{4})/)) {
        throw new Error("Virheellinen päivämääräalue!");
      }
      const [start, end] = range.split(" - ");
      startYear = start.split(".").reverse().join("").slice(0, 4);
      endYear = end.split(".").reverse().join("").slice(0, 4);
    }

    const shifts = [];
    const holidays = [];
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
        shifts.push({ date, startTime, endTime, desc });
      } else if (desc.toLowerCase().includes("loma")) {
        holidays.push({ date, desc });
      }
    }

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
      if (reminder !== "none") {
        icsContent += `BEGIN:VALARM\r\n` +
                      `TRIGGER:-PT${reminder}M\r\n` +
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

    icsBlob = new Blob([icsContent], { type: "text/calendar" });
    const url = URL.createObjectURL(icsBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tyovuorot.ics";
    link.click();

    document.getElementById("shareButton").classList.remove("hidden");
    statusText.textContent = "ICS-tiedosto on ladattu! Lisää se kalenteriin tai jaa.";
    status.classList.add("success");
    spinner.style.display = "none";
    preview.classList.remove("hidden"); // Ensure preview stays visible after download
  } catch (error) {
    statusText.textContent = `Virhe tapahtui: ${error.message}`;
    status.classList.add("error");
    spinner.style.display = "none";
    console.error(error);
  }
}

function shareICS() {
  if (navigator.share && icsBlob) {
    navigator.share({
      files: [new File([icsBlob], "tyovuorot.ics", { type: "text/calendar" })],
      title: "Työvuorot",
      text: "Jaa työvuorosi ICS-tiedostona."
    }).catch(error => {
      console.error("Sharing failed:", error);
      fallbackShare();
    });
  } else {
    fallbackShare();
  }
}

function fallbackShare() {
  const url = URL.createObjectURL(icsBlob);
  navigator.clipboard.writeText(url).then(() => {
    alert("ICS-tiedoston linkki kopioitu leikepöydälle! Voit liittää sen viestiin.");
  }).catch(error => {
    console.error("Clipboard write failed:", error);
    alert("Jako epäonnistui. Lataa tiedosto ja jaa se manuaalisesti.");
  });
}

document.getElementById("dropZone").addEventListener("dragover", handleDragOver);
document.getElementById("dropZone").addEventListener("dragleave", handleDragLeave);
document.getElementById("dropZone").addEventListener("drop", handleDrop);
updateButtonState(); // Initialize button state