// Enable/disable button based on file selection
function updateButtonState() {
    const fileInput = document.getElementById("pdfInput");
    const generateButton = document.getElementById("generateButton");
    generateButton.disabled = !fileInput.files.length;
  }
  
  // Main function to generate ICS from PDF
  async function generateICS() {
    const fileInput = document.getElementById("pdfInput");
    const status = document.getElementById("status");
    status.textContent = "Käsitellään tiedostoa...";
  
    const file = fileInput.files[0];
    if (!file) {
      status.textContent = "Valitse PDF-tiedosto ensin!";
      return;
    }
  
    try {
      // Load PDF with pdf.js
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        text += textContent.items.map(item => item.str).join(" ") + "\n";
      }
  
      // Extract date range from header
      const dateRangeMatch = text.match(/(\d{1,2}\.\d{1,2}\.\d{4})\s*[-–—]\s*(\d{1,2}\.\d{1,2}\.\d{4})/);
      let startYear, endYear;
      if (dateRangeMatch) {
        const startDate = dateRangeMatch[1].split(".").reverse().join("");
        const endDate = dateRangeMatch[2].split(".").reverse().join("");
        startYear = startDate.slice(0, 4);
        endYear = endDate.slice(0, 4);
      } else {
        status.textContent = "Päivämääräaluetta ei löydy PDF:stä!";
        return;
      }
  
      // Parse shifts and holidays
      const shifts = [];
      const holidays = [];
      const shiftPattern = /(\d{1,2}\.\d{1,2})\s+(?:(\d{2}:\d{2}\s*-\s*\d{2}:\d{2})\s+)?(.+?)(?=\d{1,2}\.\d{1,2}|$)/g;
      let match;
      while ((match = shiftPattern.exec(text)) !== null) {
        const [_, dateStr, timeRange, descRaw] = match;
        const [day, month] = dateStr.split(".");
        const year = parseInt(month) <= 3 && parseInt(month) >= 1 ? endYear : startYear; // Adjust based on month
        const date = `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}`;
  
        // Clean up description by taking text after time range and before "Tunnit" or next date
        const descParts = descRaw.split(" ");
        const descIndex = timeRange ? descParts.indexOf(timeRange.split("-")[1].trim()) + 1 : 0;
        let desc = descParts.slice(descIndex).join(" ").trim();
        desc = desc.replace(/Liikenteenohjauskeskus\s*\.{3}/i, "").trim(); // Remove department
        desc = desc.replace(/\d{1,2}:\d{2}/g, "").trim(); // Remove stray times (e.g., Tunnit)
        desc = desc.replace(/\s+/g, " ").trim(); // Normalize spaces
  
        if (timeRange) {
          const [startTime, endTime] = timeRange.split("-").map(t => t.trim().replace(" ", ""));
          shifts.push({ date, startTime, endTime, desc });
        } else if (desc.toLowerCase().includes("loma")) {
          holidays.push({ date, desc });
        }
      }
  
      if (!shifts.length && !holidays.length) {
        status.textContent = "Ei työvuoroja tai lomia löydetty PDF:stä!";
        return;
      }
  
      // Generate ICS content with proper line breaks
      let icsContent = "BEGIN:VCALENDAR\r\n" +
                      "VERSION:2.0\r\n" +
                      "PRODID:-//Make//TyovuoroWeb//FI\r\n";
  
      // Add shifts
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
                      "DESCRIPTION:\r\n" +
                      "END:VEVENT\r\n";
      });
  
      // Add holidays (all-day events)
      holidays.forEach((holiday, index) => {
        const uid = `${holiday.date}T000000Z-${String(shifts.length + index + 1).padStart(3, "0")}@make`;
        icsContent += "BEGIN:VEVENT\r\n" +
                      `SUMMARY:${holiday.desc}\r\n` +
                      `DTSTART;VALUE=DATE:${holiday.date}\r\n` +
                      `DTEND;VALUE=DATE:${parseInt(holiday.date) + 1}\r\n` +
                      `UID:${uid}\r\n` +
                      "DESCRIPTION:\r\n" +
                      "TRANSP:TRANSPARENT\r\n" + // Free time, not busy
                      "END:VEVENT\r\n";
      });
  
      icsContent += "END:VCALENDAR\r\n";
  
      // Trigger download
      const blob = new Blob([icsContent], { type: "text/calendar" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "tyovuorot.ics";
      link.click();
  
      status.textContent = "ICS-tiedosto on ladattu! Voit nyt lisätä sen kalenteriin.";
    } catch (error) {
      status.textContent = `Virhe tapahtui: ${error.message}`;
      console.error(error);
    }
  }