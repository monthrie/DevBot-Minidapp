let currentFile = null;
let files = {};
let editor;

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

  const chatBody = document.getElementById("chat-body");
  const messages = Array.from(chatBody.children);
  const history = [];
  
  // Only process the last 10 messages
  const messageCount = Math.min(messages.length, 8);
  for (let i = 0; i < messageCount; i++) {
    const messageEl = messages[i];
    const isUser = messageEl.classList.contains("user");
    const messageText = messageEl.textContent;
    history.unshift({
      sender: isUser ? "user" : "assistant",
      content: messageText
    });
  }

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
          messages: history
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

function copyToClipboard(text, button) {
  navigator.clipboard.writeText(text).then(
    function () {
      if (button) {
        const originalHTML = button.innerHTML;
        button.innerHTML = `<i class="fas fa-check"></i><span>Copied!</span>`;
        setTimeout(() => {
          button.innerHTML = originalHTML;
        }, 2000);
      }
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
      const firstLine = codeContent.split("\n")[0].trim();
      const language = firstLine.match(/^[a-zA-Z0-9]+$/)
        ? firstLine
        : "plaintext";
      const code =
        language === firstLine
          ? codeContent.substring(firstLine.length).trim()
          : codeContent;

      // Check if it's a complete HTML file and the sender is the bot
      if (sender === "bot" && isCompleteHtmlFile(codeContent)) {
        // Extract the title from the HTML
        const titleMatch = codeContent.match(/<title>(.*?)<\/title>/i);
        const dappName = titleMatch ? titleMatch[1] : "Generated MiniDapp";
        unselectFile();
        openSidePanelWithCode(code);

        // Create a small box with the dapp name and code icon
        const dappBox = document.createElement("div");
        dappBox.className = "dapp-name-box";
        dappBox.onclick = function () {
          unselectFile();
          openSidePanelWithCode(code);
        };
        dappBox.innerHTML = `
          <i class="fas fa-code"></i>
          <span>${dappName}</span>
        `;
        messageElement.appendChild(dappBox);
      } else {
        // Original code for displaying code blocks

        const preElement = document.createElement("pre");
        preElement.className = `language-${language}`;

        const codeElement = document.createElement("code");
        codeElement.className = `language-${language}`;
        codeElement.textContent = code;

        const codeContainer = document.createElement("div");
        codeContainer.className = "response-code-container";

        const buttonContainer = document.createElement("div");
        buttonContainer.className = "code-button-container";

        const copyButton = document.createElement("button");
        copyButton.className = "copy-button";
        copyButton.innerHTML = `
            <i class="fas fa-copy"></i>
            <span>Copy</span>
        `;
        copyButton.onclick = function () {
          copyToClipboard(code, copyButton);
        };

        const editButton = document.createElement("button");
        editButton.className = "edit-button";
        editButton.innerHTML = `
            <i class="fas fa-edit"></i>
            <span>Edit</span>
        `;
        editButton.onclick = function () {
          unselectFile();
          openSidePanelWithCode(code);
        };

        buttonContainer.appendChild(copyButton);
        buttonContainer.appendChild(editButton);
        codeContainer.appendChild(buttonContainer);

        // Check if the code is a complete HTML file
        if (isCompleteHtmlFile(code)) {
          const compileButton = document.createElement("button");
          compileButton.className = "compile-button";
          compileButton.textContent = "Compile MiniDapp";
          compileButton.onclick = function () {
            compileMiniDapp(code);
          };
          buttonContainer.appendChild(compileButton);
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
          p.style.margin =
            pIndex === 0 && index === 0 ? "0 0 10px 0" : "10px 0";
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
    copyButton.innerHTML = '<i class="fas fa-copy"></i>';
    copyButton.onclick = function () {
      navigator.clipboard.writeText(message).then(
        function () {
          const originalIcon = copyButton.innerHTML;
          copyButton.innerHTML = '<i class="fas fa-check"></i><span>Copied!</span>';
          setTimeout(() => {
            copyButton.innerHTML = originalIcon;
          }, 2000);
        },
        function (err) {
          console.error("Could not copy text: ", err);
        }
      );
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
  const nameInput = document.getElementById("dapp-name");
  const directInstallBtn = document.getElementById("direct-install");
  const downloadBoilerplateBtn = document.getElementById(
    "download-boilerplate"
  );

  // Create the Import Files button
  const importFilesBtn = document.createElement("button");
  importFilesBtn.textContent = "Import Files";
  importFilesBtn.type = "button"; // Explicitly set the type to "button"
  importFilesBtn.onclick = function (event) {
    event.preventDefault(); // Prevent default form submission
    showImportFilesModal();
  };

  // Insert the Import Files button before the Direct Install button
  directInstallBtn.parentNode.insertBefore(importFilesBtn, directInstallBtn);

  // Set a default name with timestamp
  nameInput.value = "MyMiniDapp_" + Date.now();
  document.getElementById("dapp-description").value = "";
  document.getElementById("dapp-version").value = "0.1.0";

  modal.style.display = "flex";

  span.onclick = function () {
    modal.style.display = "none";
    // Remove the Import Files button when closing the modal
    importFilesBtn.remove();
  };

  window.onclick = function (event) {
    if (event.target == modal) {
      modal.style.display = "none";
      // Remove the Import Files button when closing the modal
      importFilesBtn.remove();
    }
  };

  directInstallBtn.onclick = function () {
    const dappDetails = getDappDetails();
    createAndInstallMiniDapp(codeContent, dappDetails);
    modal.style.display = "none";
    // Remove the Import Files button after compilation
    importFilesBtn.remove();
  };

  downloadBoilerplateBtn.onclick = function () {
    const dappDetails = getDappDetails();
    createAndDownloadMiniDapp(codeContent, dappDetails);
    modal.style.display = "none";
    // Remove the Import Files button after compilation
    importFilesBtn.remove();
  };
}

function getDappDetails() {
  return {
    name: document.getElementById("dapp-name").value,
    description: document.getElementById("dapp-description").value,
    version: document.getElementById("dapp-version").value,
  };
}

async function createAndInstallMiniDapp(codeContent, dappDetails) {
  const htmlContent = generateHtmlContent(codeContent, dappDetails.name);
  const dappConfContent = generateDappConf(dappDetails);
  const sanitizedName = sanitizeName(dappDetails.name);

  try {
    const zip = new JSZip();
    const folder = zip.folder(sanitizedName);

    // Add all files to the folder
    const files = {
      "index.html": htmlContent,
      ...importedFiles,
    };
    
    // Add each file to the zip folder
    for (const [filename, content] of Object.entries(files)) {
      folder.file(filename, content);
    }

    // Add dapp.conf
    folder.file("dapp.conf", JSON.stringify(dappConfContent, null, 2));

    try {
      // Fetch and add mds.js
      const response = await fetch("mds.js");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const mdsJsContent = await response.text();
      folder.file("mds.js", mdsJsContent);
    } catch (error) {
      console.error("Failed to load mds.js:", error);
    }

    // Generate zip content and convert to hex
    const content = await zip.generateAsync({ type: "blob" });
    const buffer = await content.arrayBuffer();
    const hexString = Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    // Install the MiniDapp
    installMiniDapp(hexString, sanitizedName);

  } catch (error) {
    console.error("Error creating MiniDapp:", error);
    showNotification("Failed to create MiniDapp: " + error.message, "error");
  }
}

async function createAndDownloadMiniDapp(codeContent, dappDetails) {
  const htmlContent = generateHtmlContent(codeContent, dappDetails.name);
  const dappConfContent = generateDappConf(dappDetails);
  const sanitizedName = sanitizeName(dappDetails.name);

  const zip = new JSZip();
  const files = {
    "index.html": htmlContent,
    ...importedFiles,
  };

  try {
    const updatedZip = await addFilesToZip(
      zip,
      files,
      dappConfContent,
      sanitizedName
    );
    const content = await updatedZip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const link = document.createElement("a");
    link.href = url;
    link.download = sanitizedName + ".zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error creating MiniDapp:", error);
    showNotification("Failed to create MiniDapp", "error");
  }
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

async function addFilesToZip(zip, files, dappConfContent, sanitizedName) {
  // Create a folder for the MiniDapp
  const folder = zip.folder(sanitizedName);

  // Add all files to the folder
  for (const [filename, content] of Object.entries(files)) {
    folder.file(filename, content);
  }

  // Add dapp.conf
  folder.file("dapp.conf", JSON.stringify(dappConfContent, null, 2));

  try {
    // Fetch and add mds.js
    const response = await fetch("mds.js");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const mdsJsContent = await response.text();
    folder.file("mds.js", mdsJsContent);
  } catch (error) {
    console.error("Failed to load mds.js:", error);
  }

  return zip;
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

/**
 * Compiles the code from the editor into a MiniDapp
 * Triggered when clicking "Make MiniDapp" button in the file explorer
 */
function compileDIYCode() {
  // Show the compile modal with details form
  const modal = document.getElementById("compile-modal");
  modal.style.display = "flex";

  // Set up event listeners for the compile modal buttons
  document.getElementById("direct-install").onclick = async function () {
    const dappDetails = {
      name: document.getElementById("dapp-name").value || "MyMiniDapp",
      description:
        document.getElementById("dapp-description").value ||
        "A MiniDapp created with MiniDevBot",
      version: document.getElementById("dapp-version").value || "0.1.0",
    };

    try {
      const zip = new JSZip();

      // Add all files from the file explorer to the zip
      Object.keys(files).forEach((fileName) => {
        zip.file(fileName, files[fileName]);
      });

      // Add dapp.conf configuration file
      zip.file("dapp.conf", JSON.stringify(dappDetails, null, 2));

      // Generate zip content as blob
      const content = await zip.generateAsync({ type: "blob" });

      // Convert to base64 for MDS installation
      const reader = new FileReader();
      reader.readAsDataURL(content);
      reader.onloadend = function () {
        const base64data = reader.result.split(",")[1];

        // Install using MDS API
        MDS.file.install(base64data, function (resp) {
          if (resp.status) {
            showNotification("MiniDapp installed successfully!", "success");
          } else {
            showNotification("Installation failed: " + resp.error, "error");
          }
        });
      };
    } catch (error) {
      showNotification("Error creating MiniDapp: " + error.message, "error");
    }

    modal.style.display = "none";
  };

  // Handle download button click
  document.getElementById("download-boilerplate").onclick = async function () {
    const dappDetails = {
      name: document.getElementById("dapp-name").value || "MyMiniDapp",
      description:
        document.getElementById("dapp-description").value ||
        "A MiniDapp created with MiniDevBot",
      version: document.getElementById("dapp-version").value || "0.1.0",
    };

    try {
      const zip = new JSZip();

      // Add all files from the file explorer
      Object.keys(files).forEach((fileName) => {
        zip.file(fileName, files[fileName]);
      });

      // Add dapp.conf
      zip.file("dapp.conf", JSON.stringify(dappDetails, null, 2));

      try {
        // Fetch and add mds.js
        const response = await fetch("mds.js");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const mdsJsContent = await response.text();
        zip.file("mds.js", mdsJsContent);
      } catch (error) {
        console.error("Failed to load mds.js:", error);
      }

      // Generate and trigger download of the zip file
      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${dappDetails.name}.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      showNotification("Error creating MiniDapp: " + error.message, "error");
    }

    modal.style.display = "none";
  };

  // Close button functionality
  const closeBtn = modal.querySelector(".close");
  closeBtn.onclick = function () {
    modal.style.display = "none";
  };

  // Click outside modal to close
  window.onclick = function (event) {
    if (event.target == modal) {
      modal.style.display = "none";
    }
  };
}

function closeDIYCompileModal() {
  document.getElementById("diyCompileModal").style.display = "none";
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
    preview.srcdoc =
      editorContent === "" ? getEmptyPreviewHTML() : editorContent;
  }
}

// Initialize CodeMirror for the side panel
document.addEventListener("DOMContentLoaded", (event) => {
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
    lineWrapping: true,
  });

  editor.on("change", function () {
    document.getElementById("diyCompileInput").value = editor.getValue();
    saveCurrentFile();
  });

  document
    .getElementById("importFileBtn")
    .addEventListener("click", importFile);
  updateFileList();
});

const viewToggle = document.getElementById("viewToggle");
const toggleSwitch = document.querySelector(".toggle-switch");
const toggleOptions = document.querySelectorAll(".toggle-option");
const codeView = document.getElementById("code-view");
const preview = document.getElementById("preview");

let isCodeActive = true;

toggleOptions.forEach((option) => {
  option.addEventListener("click", function () {
    isCodeActive = this.dataset.view === "code";
    updateToggleState();
  });
});

function updateToggleState() {
  if (isCodeActive) {
    toggleSwitch.style.transform = "translateX(0)";
    toggleOptions[0].classList.add("active");
    toggleOptions[1].classList.remove("active");
  } else {
    toggleSwitch.style.transform = "translateX(100%)";
    toggleOptions[0].classList.remove("active");
    toggleOptions[1].classList.add("active");
  }
  toggleView();
}

function toggleSidePanel() {
  const sidePanel = document.getElementById("sidePanel");
  const toggleButton = document.getElementById("toggle-side-panel");
  const mainContent = document.querySelector(".main-content");

  sidePanel.classList.toggle("open");
  toggleButton.classList.toggle("active");

  if (sidePanel.classList.contains("open")) {
    mainContent.style.marginRight = "50%";
  } else {
    mainContent.style.marginRight = "0";
  }
}

// New function to open the side panel and paste the code
function openSidePanelWithCode(code) {
  const sidePanel = document.getElementById("sidePanel");
  const toggleButton = document.getElementById("toggle-side-panel");
  const mainContent = document.querySelector(".main-content");

  sidePanel.classList.add("open");
  toggleButton.classList.add("active");
  mainContent.style.marginRight = "50%";

  editor.setValue(code);

  isCodeActive = true;
  updateToggleState();
}

function copyCodeFromEditor() {
  const code = editor.getValue();
  const copyButton = document.getElementById("copyEditorContentBtn");
  copyToClipboard(code, copyButton);
}

let importedFiles = {};

function showImportFilesModal(event) {
  if (event) event.preventDefault(); // Prevent default action if an event is passed
  document.getElementById("importFilesModal").style.display = "flex";
}

function closeImportFilesModal(event) {
  if (event) event.preventDefault(); // Prevent default action if an event is passed
  document.getElementById("importFilesModal").style.display = "none";
}

document
  .getElementById("fileInput")
  .addEventListener("change", function (event) {
    const fileList = document.getElementById("fileList");
    fileList.innerHTML = "";

    for (let file of event.target.files) {
      const listItem = document.createElement("div");
      listItem.textContent = file.name;
      fileList.appendChild(listItem);
    }
  });

document
  .getElementById("fileExplorer")
  .addEventListener("dragover", function (event) {
    event.preventDefault();
  });

document
  .getElementById("fileExplorer")
  .addEventListener("drop", function (event) {
    event.preventDefault();
    const files = event.dataTransfer.files;
    const fileList = document.getElementById("fileList");
    fileList.innerHTML = "";

    for (let file of files) {
      const listItem = document.createElement("div");
      listItem.textContent = file.name;
      fileList.appendChild(listItem);
    }
  });

document.getElementById("compileButton").addEventListener("click", function () {
  const codeContent = editor.getValue();
  if (!codeContent.trim()) {
    showNotification("Please enter some code before compiling.", "error");
    return;
  }

  const dappDetails = getDappDetails();
  createAndDownloadMiniDapp(codeContent, dappDetails);
});

/**
 * File explorer functionality
 */

/**
 * Creates a new file in the file explorer
 * Triggered by "New File" button click
 */
function createNewFile() {
  const fileName = prompt("Enter file name:");
  if (fileName && !files[fileName]) {
    // Add .txt extension if no extension provided
    const finalFileName = fileName.includes(".") ? fileName : `${fileName}.txt`;
    files[finalFileName] = "";
    currentFile = finalFileName;
    updateFileList();
    selectFile(finalFileName);
  } else if (files[fileName]) {
    alert("File already exists!");
  }
}

/**
 * Imports files through file input
 * Triggered by "Import File" button click
 */
function importFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.onchange = (e) => {
    for (const file of e.target.files) {
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        files[file.name] = readerEvent.target.result;
      };
      reader.readAsText(file);
    }
    setTimeout(updateFileList, 100);
  };
  input.click();
}

/**
 * Updates the file list in the file explorer
 * Called after file operations
 */
function updateFileList() {
  const fileList = document.getElementById("fileList");
  fileList.innerHTML = "";
  // Add click handler to the fileList div
  fileList.onclick = handleFileExplorerClick;

  Object.keys(files)
    .sort()
    .forEach((fileName) => {
      const fileItem = document.createElement("div");
      fileItem.className = "file-item";

      const fileNameSpan = document.createElement("span");
      fileNameSpan.textContent = fileName;
      fileNameSpan.onclick = (e) => {
        e.stopPropagation(); // Prevent click from bubbling to fileList
        selectFile(fileName);
      };
      if (fileName === currentFile) {
        fileItem.classList.add("active");
      }

      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-file-btn";
      deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
      deleteButton.onclick = (e) => {
        e.stopPropagation(); // Prevent click from bubbling to fileList
        deleteFile(fileName);
      };

      fileItem.appendChild(fileNameSpan);
      fileItem.appendChild(deleteButton);
      fileList.appendChild(fileItem);
    });
}

function deleteFile(fileName) {
  if (confirm(`Are you sure you want to delete ${fileName}?`)) {
    delete files[fileName];
    if (currentFile === fileName) {
      currentFile = null;
      editor.setValue("");
      document.getElementById("currentFileName").textContent =
        "No file selected";
    }
    updateFileList();
    showNotification(`Deleted ${fileName}`, "success");
  }
}

/**
 * Selects a file in the file explorer and loads it into the editor
 * @param {string} fileName - Name of the file to select
 */
function selectFile(fileName) {
  currentFile = fileName;
  document.getElementById("currentFileName").textContent = fileName;

  if (!editor) {
    // Initialize CodeMirror if not already initialized
    editor = CodeMirror(document.getElementById("code-view"), {
      mode: getFileMode(fileName),
      theme: "dracula",
      lineNumbers: true,
      autoCloseTags: true,
      autoCloseBrackets: true,
      matchBrackets: true,
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: true,
      lineWrapping: true,
      readOnly: false,
    });

    // Auto-save on change
    editor.on("change", function () {
      if (currentFile) {
        files[currentFile] = editor.getValue();
        showNotification("Changes saved", "success");
      }
    });
  } else {
    // Update editor mode based on file type
    editor.setOption("mode", getFileMode(fileName));
  }

  editor.setValue(files[fileName] || "");
  editor.refresh();
  editor.focus();

  updateFileList();
  openSidePanel();
}

/**
 * Saves the current file content
 * Called automatically on editor changes
 */
function saveCurrentFile() {
  if (currentFile) {
    files[currentFile] = editor.getValue();
  }
}

/**
 * Shows a notification message
 * @param {string} message - Message to display
 * @param {string} type - Type of notification (success/error)
 */
function showNotification(message, type) {
  const notification = document.getElementById("notification");
  notification.textContent = message;
  notification.className = `notification ${type}`;
  notification.style.display = "block";
  setTimeout(() => {
    notification.style.display = "none";
  }, 3000);
}

/**
 * Gets the appropriate CodeMirror mode for a file type
 * @param {string} fileName - Name of the file
 * @returns {string} CodeMirror mode name
 */
function getFileMode(fileName) {
  const extension = fileName.split(".").pop().toLowerCase();
  const modeMap = {
    js: "javascript",
    javascript: "javascript",
    html: "htmlmixed",
    htm: "htmlmixed",
    css: "css",
    py: "python",
    python: "python",
    json: "javascript",
    md: "markdown",
    markdown: "markdown",
    xml: "xml",
    svg: "xml",
    txt: "text",
    php: "php",
    rb: "ruby",
    ruby: "ruby",
    java: "clike",
    c: "clike",
    cpp: "clike",
    cs: "clike",
    scala: "clike",
    kt: "clike",
  };
  return modeMap[extension] || "text";
}

function saveAsNewFile() {
  if (!editor) return;

  const content = editor.getValue();
  if (!content.trim()) {
    showNotification("Cannot save empty file", "error");
    return;
  }

  const fileName = prompt("Enter file name:");
  if (!fileName) return;

  // Add .txt extension if no extension provided
  const finalFileName = fileName.includes(".") ? fileName : `${fileName}.txt`;

  if (files[finalFileName]) {
    if (
      !confirm(
        `File ${finalFileName} already exists. Do you want to overwrite it?`
      )
    ) {
      return;
    }
  }

  files[finalFileName] = content;
  currentFile = finalFileName;
  document.getElementById("currentFileName").textContent = finalFileName;
  updateFileList();
  showNotification(`Saved as ${finalFileName}`, "success");
}

// Add this function to handle clicks on empty areas
function handleFileExplorerClick(event) {
  // Check if the click was directly on the fileList div (empty area)
  if (event.target.id === "fileList") {
    unselectFile();
  }
}

function unselectFile() {
  currentFile = null;
  editor.setValue("");
  document.getElementById("currentFileName").textContent = "No file selected";
  updateFileList();
}

function toggleFileExplorer() {
  const fileExplorer = document.getElementById("fileExplorer");
  const toggleButton = document.getElementById("toggle-file-explorer");
  const mainContent = document.querySelector(".main-content");

  fileExplorer.classList.toggle("open");
  toggleButton.classList.toggle("active");
  mainContent.classList.toggle("shifted");
}

// Add this to the existing window click event handler
document.addEventListener("click", function (event) {
  const fileExplorer = document.getElementById("fileExplorer");
  const toggleButton = document.getElementById("toggle-file-explorer");

  if (
    !fileExplorer.contains(event.target) &&
    !toggleButton.contains(event.target) &&
    fileExplorer.classList.contains("open")
  ) {
    toggleFileExplorer();
  }
});