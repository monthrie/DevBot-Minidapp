document.addEventListener("DOMContentLoaded", function () {
  const chatInput = document.getElementById("chat-input");
  const customPlaceholder = document.getElementById("custom-placeholder");

  chatInput.addEventListener("input", function () {
    if (chatInput.value) {
      customPlaceholder.style.display = "none";
    } else {
      customPlaceholder.style.display = "block";
    }
  });

  chatInput.addEventListener("focus", function () {
    customPlaceholder.style.display = "none";
  });

  chatInput.addEventListener("blur", function () {
    if (!chatInput.value) {
      customPlaceholder.style.display = "block";
    }
  });

  document
    .querySelector("#info-modal .close")
    .addEventListener("click", function () {
      document.getElementById("info-modal").style.display = "none";
    });
});

// Initialize MDS
MDS.init(function (msg) {
  if (msg.event === "inited") {
    console.log("MDS initialized");

    // Create the chatbot_responses table if it doesn't exist
    MDS.sql(
      "CREATE TABLE IF NOT EXISTS chatbot_responses (id INT AUTO_INCREMENT PRIMARY KEY, timestamp DATETIME, response TEXT)",
      function (res) {
        if (res.status) {
          console.log("Table created successfully");
        } else {
          console.error("Error creating table:", res.error);
        }
      }
    );
  }
});

function storeChatbotResponse(response) {
  const timestamp = new Date().toISOString();
  const jsonResponse = JSON.stringify(response);

  // Escape single quotes in the JSON string to prevent SQL injection
  const escapedJsonResponse = jsonResponse.replace(/'/g, "''");

  const sqlQuery = `INSERT INTO chatbot_responses (timestamp, response) VALUES ('${timestamp}', '${escapedJsonResponse}')`;

  MDS.sql(sqlQuery, function (res) {
    if (res.status) {
      console.log("Response stored successfully");
    } else {
      console.error("Error storing response:", res.error);
    }
  });
}

function getChatbotResponses(callback) {
  MDS.sql(
    "SELECT * FROM chatbot_responses ORDER BY `timestamp` DESC",
    function (res) {
      if (res.status) {
        const responses = res.rows.map((row) => ({
          id: row.id,
          timestamp: row.timestamp,
          response: JSON.parse(row.response),
        }));
        callback(responses);
      } else {
        console.error("Error retrieving responses:", res.error);
        callback([]);
      }
    }
  );
}

async function sendMessage() {
  const inputElement = document.getElementById("chat-input");
  const message = inputElement.value;
  if (!message) return;

  displayMessage("user", message);
  inputElement.value = "";
  inputElement.style.height = "auto";

  document.getElementById("loading-message").style.display = "block";

  try {
    const response = await fetch(
      "https://devbot-api-production.up.railway.app/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          message: message,
        }),
      }
    );
    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    console.log("Response content:", data.answer);

    const codeBlocks = data.answer.match(/```[\s\S]*?```/g);
    if (codeBlocks) {
      console.log("Detected code blocks:");
      codeBlocks.forEach((block, index) => {
        console.log(`Code Block ${index + 1}:`);
        console.log(block);
      });
    }

    displayMessage("bot", data.answer, data.sources);

    // Store the response in the database
    storeChatbotResponse(data.answer);
  } catch (error) {
    console.error("Error:", error);
    displayMessage("bot", "Sorry, something went wrong: " + error.message);
  } finally {
    document.getElementById("loading-message").style.display = "none";
  }
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(
    function () {
      const copyButton = event.target.closest(".copy-button");
      const copyText = copyButton.querySelector(".copy-text");
      const originalText = copyText.textContent;
      copyText.textContent = "Copied!";
      setTimeout(() => {
        copyText.textContent = originalText;
      }, 2000);
      showNotification("Copied to clipboard!", "success");
    },
    function (err) {
      console.error("Could not copy text: ", err);
    }
  );
}

function displayMessage(sender, message, sources = []) {
  const chatBody = document.getElementById("chat-body");
  const messageElement = document.createElement("div");
  messageElement.className = `chat-message ${sender}`;

  const parts = message.split(/(```[\s\S]*?```)/);

  parts.forEach((part, index) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const codeContent = part.slice(3, -3).trim();
      
      // Check if it's a complete HTML file and the sender is the bot
      if (sender === "bot" && isCompleteHtmlFile(codeContent)) {
        // Extract the title from the HTML
        const titleMatch = codeContent.match(/<title>(.*?)<\/title>/i);
        const dappName = titleMatch ? titleMatch[1] : "Generated MiniDapp";

        // Create a small box with the dapp name and code icon
        const dappBox = document.createElement("div");
        dappBox.className = "dapp-name-box";
        dappBox.onclick = function () {
          toggleSidePanel();
        };
        dappBox.innerHTML = `
          <i class="fas fa-code"></i>
          <span>${dappName}</span>
        `;
        messageElement.appendChild(dappBox);

        // Open the side panel and paste the code
        openSidePanelWithCode(codeContent);
      } else {
        // Original code for displaying code blocks
        const firstLine = codeContent.split("\n")[0].trim();
        const language = firstLine.match(/^[a-zA-Z0-9]+$/) ? firstLine : "plaintext";
        const code = language === firstLine ? codeContent.substring(firstLine.length).trim() : codeContent;

        const preElement = document.createElement("pre");
        preElement.className = `language-${language}`;

        const codeElement = document.createElement("code");
        codeElement.className = `language-${language}`;
        codeElement.textContent = code;

        const codeContainer = document.createElement("div");
        codeContainer.className = "code-container";

        const copyButton = document.createElement("button");
        copyButton.className = "copy-button";
        copyButton.innerHTML = `
              <svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
              </svg>
              <span class="copy-text">Copy</span>
            `;
        copyButton.onclick = function () {
          copyToClipboard(code);
        };

        codeContainer.appendChild(copyButton);

        // Check if the code is a complete HTML file
        if (isCompleteHtmlFile(code)) {
          const compileButton = document.createElement("button");
          compileButton.className = "compile-button";
          compileButton.textContent = "Compile MiniDapp";
          compileButton.onclick = function () {
            compileMiniDapp(code);
          };
          codeContainer.appendChild(compileButton);
        }

        codeContainer.appendChild(preElement);
        preElement.appendChild(codeElement);
        messageElement.appendChild(codeContainer);
      }
    } else {
      // Original code for displaying text parts
      const paragraphs = part.split("\n\n");
      paragraphs.forEach((paragraph, pIndex) => {
        if (paragraph.trim()) {
          const p = document.createElement("p");
          p.style.margin = pIndex === 0 && index === 0 ? "0 0 10px 0" : "10px 0";
          if (/^\d+\.\s/.test(paragraph)) {
            p.style.marginLeft = "20px";
          }
          p.innerHTML = escapeHtml(paragraph).replace(/\n/g, "<br>");
          messageElement.appendChild(p);
        }
      });
    }
  });

  if (sources && sources.length > 0) {
    const sourcesToggle = document.createElement("div");
    sourcesToggle.className = "sources-toggle";
    sourcesToggle.innerHTML = '<span class="arrow">▶</span> Show sources';
    messageElement.appendChild(sourcesToggle);

    const sourcesContent = document.createElement("div");
    sourcesContent.className = "sources-content";
    sourcesContent.innerHTML = sources
      .map((source) => {
        const cleanedSource = source.replace(/^.*?(type|input)\//, "");
        return `- ${escapeHtml(cleanedSource)}`;
      })
      .join("<br>");
    messageElement.appendChild(sourcesContent);

    sourcesToggle.onclick = function () {
      const arrow = this.querySelector(".arrow");
      arrow.classList.toggle("down");
      if (
        sourcesContent.style.display === "none" ||
        sourcesContent.style.display === ""
      ) {
        sourcesContent.style.display = "block";
        this.innerHTML = '<span class="arrow down">▶</span> Hide sources';
      } else {
        sourcesContent.style.display = "none";
        this.innerHTML = '<span class="arrow">▶</span> Show sources';
      }
    };
  }

  if (sender === "bot") {
    const copyButton = document.createElement("button");
    copyButton.className = "copy-response-button";
    copyButton.innerHTML = '<i class="fas fa-copy"></i> Copy Response';
    copyButton.onclick = function() {
      copyToClipboard(message);
    };
    messageElement.appendChild(copyButton);
  }

  chatBody.insertBefore(messageElement, chatBody.firstChild);
  Prism.highlightAllUnder(messageElement);
}

// Add this new function to check if the code is a complete HTML file
function isCompleteHtmlFile(code) {
  const trimmedCode = code.trim().toLowerCase();
  return (
    trimmedCode.startsWith("<!doctype html>") ||
    trimmedCode.startsWith("<html") ||
    (trimmedCode.includes("<html") && trimmedCode.includes("</html>"))
  );
}

function adjustTextareaHeight() {
  const textarea = document.getElementById("chat-input");
  textarea.style.height = "auto";
  const newHeight = Math.min(textarea.scrollHeight, window.innerHeight / 3);
  textarea.style.height = newHeight + "px";
}

document
  .getElementById("chat-input")
  .addEventListener("input", adjustTextareaHeight);

window.addEventListener("resize", adjustTextareaHeight);

adjustTextareaHeight();

function showAbout() {
  toggleMenu();
  document.getElementById("info-modal").style.display = "flex";
}

window.onclick = function (event) {
  if (event.target == document.getElementById("info-modal")) {
    document.getElementById("info-modal").style.display = "none";
  }
};

function compileMiniDapp(codeContent) {
  const modal = document.getElementById("compile-modal");
  const span = modal.querySelector(".close");
  const form = document.getElementById("compile-form");
  const nameInput = document.getElementById("dapp-name");
  const directInstallBtn = document.getElementById("direct-install");
  const downloadBoilerplateBtn = document.getElementById(
    "download-boilerplate"
  );

  // Set a default name with timestamp
  nameInput.value = "MyMiniDapp_" + Date.now();
  document.getElementById("dapp-description").value = "";
  document.getElementById("dapp-version").value = "0.1.0";

  modal.style.display = "flex";

  span.onclick = function () {
    modal.style.display = "none";
  };

  window.onclick = function (event) {
    if (event.target == modal) {
      modal.style.display = "none";
    }
  };

  directInstallBtn.onclick = function () {
    const dappDetails = getDappDetails();
    createAndInstallMiniDapp(codeContent, dappDetails);
    modal.style.display = "none";
  };

  downloadBoilerplateBtn.onclick = function () {
    const dappDetails = getDappDetails();
    createAndDownloadMiniDapp(codeContent, dappDetails);
    modal.style.display = "none";
  };
}

function getDappDetails() {
  return {
    name: document.getElementById("dapp-name").value,
    description: document.getElementById("dapp-description").value,
    version: document.getElementById("dapp-version").value,
  };
}

function createAndInstallMiniDapp(codeContent, dappDetails) {
  const htmlContent = generateHtmlContent(codeContent, dappDetails.name);
  const dappConfContent = generateDappConf(dappDetails);
  const sanitizedName = sanitizeName(dappDetails.name);

  const zip = new JSZip();
  addFilesToZip(zip, htmlContent, dappConfContent, sanitizedName);

  zip.generateAsync({ type: "blob" }).then(function (content) {
    const reader = new FileReader();
    reader.readAsArrayBuffer(content);
    reader.onloadend = function () {
      const arrayBuffer = reader.result;
      const hexString = arrayBufferToHexString(arrayBuffer);
      installMiniDapp(hexString, sanitizedName);
    };
  });
}

function createAndDownloadMiniDapp(codeContent, dappDetails) {
  const htmlContent = generateHtmlContent(codeContent, dappDetails.name);
  const dappConfContent = generateDappConf(dappDetails);
  const sanitizedName = sanitizeName(dappDetails.name);

  const zip = new JSZip();
  addFilesToZip(zip, htmlContent, dappConfContent, sanitizedName);

  zip.generateAsync({ type: "blob" }).then(function (content) {
    const url = URL.createObjectURL(content);
    const link = document.createElement("a");
    link.href = url;
    link.download = sanitizedName + ".zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

function generateHtmlContent(codeContent, dappName) {
  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${dappName}</title>
    <script type="text/javascript" src="mds.js"><\/script>
<\/head>
<body>
    <pre><code>${codeContent}</code></pre>
    <script>
        MDS.init(function(msg) {
            if (msg.event === "inited") {
                console.log("MDS initialized");
            }
        });
    <\/script>
<\/body>
<\/html>
`;
}

function generateDappConf(dappDetails) {
  return {
    name: dappDetails.name,
    icon: "brain.png",
    version: dappDetails.version,
    description: dappDetails.description || "Generated MiniDapp",
    browser: "internal",
  };
}

function sanitizeName(name) {
  return name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
}

function addFilesToZip(zip, htmlContent, dappConfContent, sanitizedName) {
  zip.file("index.html", htmlContent);
  zip.file("dapp.conf", JSON.stringify(dappConfContent, null, 2));
  const mdsJsContent = document.getElementById("mdsJsContent").textContent;
  zip.file("mds.js", mdsJsContent);
}

function arrayBufferToHexString(arrayBuffer) {
  return Array.from(new Uint8Array(arrayBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function installMiniDapp(hexZipContent, dappName) {
  MDS.file.savebinary(dappName + ".mds.zip", hexZipContent, function (resp) {
    if (resp.status) {
      MDS.file.getpath(dappName + ".mds.zip", function (pathResp) {
        if (pathResp.status) {
          const filePath = pathResp.response.getpath.path;
          const installCommand = "mds action:install file:" + filePath;
          MDS.cmd(installCommand, function (installResp) {
            if (installResp.status) {
              showNotification("MiniDapp installed successfully!", "success");
            } else {
              showNotification(
                "Failed to install MiniDapp: " + installResp.error,
                "error"
              );
            }
            MDS.file.delete(dappName + ".mds.zip", function () {});
          });
        } else {
          showNotification(
            "Failed to get file path: " + pathResp.error,
            "error"
          );
        }
      });
    } else {
      showNotification("Failed to save zip file: " + resp.error, "error");
    }
  });
}

function showNotification(message, type) {
  const notification = document.getElementById("notification");
  notification.textContent = message;
  notification.className = "notification " + type + " show";

  setTimeout(() => {
    notification.className = "notification " + type;
  }, 3000);
}

function showDonateModal() {
  toggleMenu();
  document.getElementById("donateModal").style.display = "flex";
}

function closeDonateModal() {
  document.getElementById("donateModal").style.display = "none";
}

function donate(amount) {
  const address =
    "MxG0814S8TAB4D57Y0Z6V8BUEW0YP3AN6G127VNPC8CKY72B6UMU1Y3C205ZE2P";

  MDS.cmd(`send amount:${amount} address:${address}`, function (res) {
    if (res.status) {
      alert(`Thank you for your donation of ${amount} Minima!`);
    } else if (res.pending) {
      alert(
        "Transaction is pending. Please check your notifications to approve."
      );
    } else {
      alert("Transaction failed. Please try again.");
    }
    closeDonateModal();
  });
}

// Close modal when clicking outside
window.onclick = function (event) {
  if (event.target == document.getElementById("donateModal")) {
    closeDonateModal();
  }
  if (event.target == document.getElementById("info-modal")) {
    document.getElementById("info-modal").style.display = "none";
  }
  if (event.target == document.getElementById("compile-modal")) {
    document.getElementById("compile-modal").style.display = "none";
  }
  if (event.target == document.getElementById("diyCompileModal")) {
    closeDIYCompileModal();
  }
};

function toggleMenu() {
  document.getElementById("sideMenu").classList.toggle("open");
}

// Close menu when clicking outside
document.addEventListener("click", function (event) {
  const sideMenu = document.getElementById("sideMenu");
  const burgerButton = document.getElementById("burger-button");

  if (
    !sideMenu.contains(event.target) &&
    !burgerButton.contains(event.target)
  ) {
    sideMenu.classList.remove("open");
  }
});

function showSettings() {
  // Placeholder for settings functionality
  toggleMenu();
  alert("Settings functionality coming soon!");
}

function showDIYCompile() {
  toggleMenu();
  document.getElementById("diyCompileModal").style.display = "flex";
}

function compileDIYCode() {
  const code = document.getElementById("diyCompileInput").value;
  closeDIYCompileModal();
  compileMiniDapp(code);
  document.getElementById("diyCompileInput").value = "";
}

function closeDIYCompileModal() {
  document.getElementById("diyCompileModal").style.display = "none";
}

function toggleSidePanel() {
  const sidePanel = document.getElementById('sidePanel');
  const toggleButton = document.getElementById('toggle-side-panel');
  
  sidePanel.classList.toggle('open');
  toggleButton.classList.toggle('active');
  
  if (sidePanel.classList.contains('open')) {
    mainContent.style.marginRight = '50%';
  } else {
    mainContent.style.marginRight = '0';
  }
}

// Function to generate empty preview HTML
function getEmptyPreviewHTML() {
    return `
        <html>
        <head>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                body {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    font-family: Arial, sans-serif;
                    font-size: 26px;
                    background-color: #222;
                    color: #888;
                }
                .empty-preview {
                    text-align: center;
                }
                .sad-face {
                    font-size: 48px;
                    margin-bottom: 20px;
                }
            </style>
        </head>
        <body>
            <div class="empty-preview">
                <div class="sad-face"><i class="fas fa-face-frown"></i></div>
                <p>Nothing to preview yet</p>
            </div>
        </body>
        </html>
    `;
}

// Update toggleView function
function toggleView() {
    if (isCodeActive) {
        codeView.style.display = "block";
        preview.style.display = "none";
    } else {
        codeView.style.display = "none";
        preview.style.display = "block";
        const editorContent = editor.getValue().trim();
        preview.srcdoc = editorContent === "" ? getEmptyPreviewHTML() : editorContent;
    }
}

// Initialize CodeMirror for the side panel
let editor;
document.addEventListener('DOMContentLoaded', (event) => {
    editor = CodeMirror.fromTextArea(document.getElementById("diyCompileInput"), {
        mode: "htmlmixed",
        theme: "dracula",
        lineNumbers: true,
        autoCloseTags: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: true,
        lineWrapping: true
    });

    editor.on("change", function() {
        document.getElementById("diyCompileInput").value = editor.getValue();
        if (!isCodeActive) {
            const editorContent = editor.getValue().trim();
            preview.srcdoc = editorContent === "" ? getEmptyPreviewHTML() : editorContent;
        }
    });
});

const viewToggle = document.getElementById('viewToggle');
const toggleSwitch = document.querySelector('.toggle-switch');
const toggleOptions = document.querySelectorAll('.toggle-option');
const codeView = document.getElementById("code-view");
const preview = document.getElementById("preview");

let isCodeActive = true;

toggleOptions.forEach(option => {
    option.addEventListener('click', function() {
        isCodeActive = this.dataset.view === 'code';
        updateToggleState();
    });
});

function updateToggleState() {
    if (isCodeActive) {
        toggleSwitch.style.transform = 'translateX(0)';
        toggleOptions[0].classList.add('active');
        toggleOptions[1].classList.remove('active');
    } else {
        toggleSwitch.style.transform = 'translateX(100%)';
        toggleOptions[0].classList.remove('active');
        toggleOptions[1].classList.add('active');
    }
    toggleView();
}

// New function to open the side panel and paste the code
function openSidePanelWithCode(code) {
  const sidePanel = document.getElementById('sidePanel');
  const mainContent = document.querySelector('.main-content');
  
  // Open the side panel
  sidePanel.classList.add('open');
  mainContent.style.marginRight = '50%';

  // Set the code in the CodeMirror editor
  editor.setValue(code);

  // Switch to the code view
  isCodeActive = true;
  updateToggleState();
}

// Add this function to copy text to clipboard
function copyToClipboard(text, isCode) {
  navigator.clipboard.writeText(text).then(function() {
    if (isCode) {
      showNotification("Code copied to clipboard!", "success");
    } else {
      showNotification("Response copied to clipboard!", "success");
    }
  }, function(err) {
    if (isCode) {
      showNotification("Failed to copy code", "error");
    } else {
      showNotification("Failed to copy response", "error");
    }
  });
}

function copyCodeFromEditor() {
  const code = editor.getValue();
  copyToClipboard(code, true);
}

