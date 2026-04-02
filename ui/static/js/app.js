const NEW_CONTRACT_YAML = `apiVersion: v3.1.0
kind: DataContract
id: my-contract
name: My Contract
version: 1.0.0
status: draft
domain: healthcare
dataProduct: parquet file
description:
  purpose: ""
  usage: ""
  limitations: ""

schema:
  - name: table_name
    physicalType: TABLE
    description: ""
    properties:
      - name: column_name
        logicalType: string
        physicalType: TEXT
        description: ""
        required: true
`;

// --- CodeMirror (vanilla JS, no Alpine) ---
let cmEditor = null;

function initCodeMirror() {
  const el = document.getElementById("editor-container");
  if (!el || cmEditor) return;

  const isDark = document.documentElement.classList.contains("dark");
  cmEditor = CodeMirror(el, {
    value: "",
    mode: "yaml",
    theme: isDark ? "material-darker" : "default",
    lineNumbers: true,
    tabSize: 2,
    lineWrapping: false,
    inputStyle: "textarea",
    styleActiveLine: true,
  });
  cmEditor.setSize("100%", "100%");

  // Dark mode sync
  new MutationObserver(() => {
    const dark = document.documentElement.classList.contains("dark");
    cmEditor.setOption("theme", dark ? "material-darker" : "default");
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
}

function loadYamlInEditor(content) {
  // Hide drop zone first, show editor container
  const dz = document.getElementById("editor-dropzone");
  const container = document.getElementById("editor-container");
  if (dz) dz.style.display = "none";
  if (container) container.style.display = "block";

  // Create or update editor
  if (!cmEditor) initCodeMirror();
  cmEditor.setValue(content);
  cmEditor.refresh();
  cmEditor.focus();
}

// Drop zone drag & drop
document.addEventListener("DOMContentLoaded", () => {
  const dz = document.getElementById("editor-dropzone");
  if (!dz) return;
  const box = document.getElementById("editor-dropbox");
  function dzOn() {
    dz.style.backgroundColor = "rgba(20, 184, 166, 0.05)";
    if (box) { box.style.borderColor = "#14b8a6"; box.style.backgroundColor = "rgba(20, 184, 166, 0.05)"; }
  }
  function dzOff() {
    dz.style.backgroundColor = "";
    if (box) { box.style.borderColor = ""; box.style.backgroundColor = ""; }
  }
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dzOn(); });
  dz.addEventListener("dragleave", dzOff);
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dzOff();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".yaml") || file.name.endsWith(".yml"))) {
      const reader = new FileReader();
      reader.onload = (ev) => loadYamlInEditor(ev.target.result);
      reader.readAsText(file);
    }
  });
});

// --- Alpine.js state ---
document.addEventListener("alpine:init", () => {
  Alpine.data("appState", () => ({
    yamlValid: null,
    yamlFileName: "",

    // Checker
    parquetFile: null,
    parquetFileName: "",
    parquetInfo: { columns: 0, rows: 0 },
    checkResults: [],

    get yamlContent() {
      return cmEditor ? cmEditor.getValue() : "";
    },

    get lineCount() {
      return cmEditor ? cmEditor.lineCount() : 0;
    },

    get editorReady() {
      return cmEditor && cmEditor.getValue().length > 0;
    },

    newContract() {
      this.yamlFileName = "";
      loadYamlInEditor(NEW_CONTRACT_YAML);
    },

    importYaml(event) {
      const file = event.target.files[0];
      if (!file) return;
      this.yamlFileName = file.name;
      const reader = new FileReader();
      reader.onload = (e) => loadYamlInEditor(e.target.result);
      reader.readAsText(file);
    },

    handleYamlDrop(event) {
      const file = event.dataTransfer.files[0];
      if (file && (file.name.endsWith(".yaml") || file.name.endsWith(".yml"))) {
        this.yamlFileName = file.name;
        const reader = new FileReader();
        reader.onload = (e) => loadYamlInEditor(e.target.result);
        reader.readAsText(file);
      }
    },

    validate() {
      if (window.pyValidate) {
        const result = window.pyValidate(this.yamlContent);
        this.yamlValid = result.success;
      } else {
        this.yamlValid = null;
      }
    },

    exportYaml() {
      const blob = new Blob([this.yamlContent], { type: "text/yaml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = this.yamlFileName || "datacontract.yaml";
      a.click();
      URL.revokeObjectURL(url);
    },

    // Checker actions
    handleDrop(event) {
      const file = event.dataTransfer.files[0];
      if (file && file.name.endsWith(".parquet")) {
        this.parquetFile = file;
        this.parquetFileName = file.name;
      }
    },

    handleFileSelect(event) {
      const file = event.target.files[0];
      if (file) {
        this.parquetFile = file;
        this.parquetFileName = file.name;
      }
    },

    check() {
      if (!this.parquetFile) return;
      if (window.pyCheck) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const bytes = new Uint8Array(e.target.result);
          const result = window.pyCheck(this.yamlContent, bytes);
          this.checkResults = Array.from(result.results || []);
          const info = result.info;
          if (info) {
            this.parquetInfo = { columns: info.columns || 0, rows: info.rows || 0 };
          }
        };
        reader.readAsArrayBuffer(this.parquetFile);
      }
    },
  }));
});
