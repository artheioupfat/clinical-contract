window.ClinicalModules = window.ClinicalModules || {};

window.ClinicalModules.editor = {
  async importYaml(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    await this.handleYamlFile(file);
    event.target.value = '';
  },

  downloadYaml() {
    const blob = new Blob([this.yamlText || ''], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = this.yamlName || 'contract.yaml';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    this.statusText = `Downloaded ${link.download}`;
  },

  async dropYaml(event) {
    const file = [...event.dataTransfer.files].find((f) => /\.ya?ml$/i.test(f.name));
    if (!file) return;
    await this.handleYamlFile(file);
  },

  async handleYamlFile(file) {
    this.yamlText = await file.text();
    this.yamlName = file.name;
    this.clearResults();
    this.statusText = `Loaded ${file.name}`;
  },
};
