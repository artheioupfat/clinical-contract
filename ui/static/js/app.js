const DEFAULT_YAML = `apiVersion: v3.1.0 #open data contract standard
kind: DataContract
id: export-contract
name: Export Contract
version: 1.0.0  #version du contrat
status: active
domain: healthcare
dataProduct: parquet file
description:
  purpose: "Export dataset contenant les événements médicaux et échantillons"
  usage: "Analytics et traitement downstream"
  limitations: "Les données historiques peuvent contenir des timestamps legacy"

schema:
  - name: export
    physicalType: TABLE
    description: Dataset exporté contenant les données patient
    properties:
      - name: IPP
        logicalType: string
        physicalType: TEXT
        description: Identifiant patient permanent
        required: true
        quality:
          - type: sql
            description: IPP ne doit pas être null
            query: "SELECT COUNT(*) FROM export WHERE IPP IS NULL"
            mustBe: 0
          - type: sql
            description: IPP doit faire entre 35 et 37 caractères
            query: "SELECT COUNT(*) FROM export WHERE LENGTH(IPP) NOT BETWEEN 35 AND 37"
            mustBe: 0

      - name: DATE_EVENEMENT
        logicalType: "timestamp[us, tz=Europe/Paris]"
        physicalType: DATE
        description: Date de l'événement médical
        required: true
        quality:
          - type: sql
            description: Pas de dates dans le futur
            query: "SELECT COUNT(*) FROM export WHERE DATE_EVENEMENT > CURRENT_DATE"
            mustBe: 0`;

document.addEventListener("alpine:init", () => {
  Alpine.data("appState", () => ({
    editor: null,
    yamlValid: null,

    // Checker (Phase 4)
    parquetFile: null,
    parquetFileName: "export_2026.parquet",
    parquetInfo: { columns: 6, rows: 1453 },
    checkResults: [
      { column: "IPP", expected_type: "string", error: "", result: "success", obtained: 0, expected: 0 },
      { column: "IPP", expected_type: "string", error: "IPP doit faire entre 35 et 37 caractères", result: "fail", obtained: 12, expected: 0 },
      { column: "DATE_EVENEMENT", expected_type: "timestamp", error: "", result: "success", obtained: 0, expected: 0 },
      { column: "DATE_EVENEMENT", expected_type: "timestamp", error: "Pas de dates dans le futur", result: "success", obtained: 0, expected: 0 },
      { column: "CODE_ANALYSE", expected_type: "string", error: "Colonne manquante", result: "fail", obtained: 1, expected: 0 },
    ],

    get yamlContent() {
      return this.editor ? this.editor.getValue() : "";
    },

    get lineCount() {
      return this.editor ? this.editor.lineCount() : 0;
    },

    initEditor(el) {
      const isDark = document.documentElement.classList.contains("dark");

      const editor = CodeMirror(el, {
        value: DEFAULT_YAML,
        mode: "yaml",
        theme: isDark ? "material-darker" : "default",
        lineNumbers: true,
        tabSize: 2,
        lineWrapping: false,
        inputStyle: "textarea",
        styleActiveLine: true,
        readOnly: false,
      });

      editor.setSize("100%", "100%");
      editor.refresh();

      // Force focus to confirm editability
      setTimeout(() => { editor.refresh(); }, 100);

      this.editor = editor;

      // Dark mode sync
      const htmlEl = document.documentElement;
      new MutationObserver(() => {
        const dark = htmlEl.classList.contains("dark");
        editor.setOption("theme", dark ? "material-darker" : "default");
      }).observe(htmlEl, { attributes: true, attributeFilter: ["class"] });
    },

    validate() {
      if (window.pyValidate) {
        const result = window.pyValidate(this.yamlContent);
        this.yamlValid = result.success;
      } else {
        this.yamlValid = null;
      }
    },

    importYaml(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.editor.setValue(e.target.result);
      };
      reader.readAsText(file);
    },

    exportYaml() {
      const blob = new Blob([this.yamlContent], { type: "text/yaml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "datacontract.yaml";
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
