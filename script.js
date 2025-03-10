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
  
      // Parse shifts
      const shifts = [];
      const shiftPattern = /(\d{1,2}\.\d{1,2})\s+(\d{2}:\d{2}\s*-\s*\d{2}:\d{2})\s+(.+?)(?=\d{1,2}\.\d{1,2}|$)/g;
      let match;
      while ((match = shiftPattern.exec(text)) !== null) {
        const [_, dateStr, timeRange, descRaw] = match;
        const [day, month] = dateStr.split(".");
        const [startTime, endTime] = timeRange.split("-").map(t => t.trim().replace(" ", ""));
        const year = parseInt(month) === 12 ? startYear : endYear;
        const date = `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}`;
  
        // Extract only the "Kuvaus" part (e.g., "Tauottaja", "LIITU", "Savo Yö")
        const descMatch = descRaw.match(/Tauottaja|LIITU itseopiskelu|LIITU|Kokko päivä|Seinäjoki yö|Savo Yö|SavoKarvio Päivä/i);
        const desc = descMatch ? descMatch[0] : descRaw.split(" ").slice(0, 2).join(" ");
  
        shifts.push({ date, startTime, endTime, desc });
      }
  
      if (!shifts.length) {
        status.textContent = "Ei työvuoroja löydetty PDF:stä!";
        return;
      }
  
      // Generate ICS content with proper line breaks
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
                      "DESCRIPTION:\r\n" +
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