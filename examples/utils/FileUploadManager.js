// FileUploadManager.js
export class FileUploadManager {
  constructor(mujoco, parentContext) {
    this.mujoco = mujoco;
    this.parentContext = parentContext;
    this.uploadedFiles = new Map();
    this.currentUploadPath = null;
  }

  /**
   * Creates file input elements and handles file uploads
   */
  createUploadInterface() {
    // Create a container for upload controls
    const uploadContainer = document.createElement('div');
    uploadContainer.className = 'upload-container';

    // Create drop zone
    const dropZone = document.createElement('div');
    dropZone.className = 'drop-zone';
    dropZone.innerHTML = '<div class="drop-zone-text">Drag & drop scene XML here<br>or click to browse</div>';

    // Create file input for XML
    const xmlInput = document.createElement('input');
    xmlInput.type = 'file';
    xmlInput.accept = '.xml';
    xmlInput.id = 'xmlUpload';
    xmlInput.style.display = 'none';

    // Create file input for assets and robot XML files
    const assetsInput = document.createElement('input');
    assetsInput.type = 'file';
    assetsInput.accept = '.xml,.stl,.obj,.png,.jpg,.jpeg';
    assetsInput.multiple = true;
    assetsInput.id = 'assetsUpload';
    assetsInput.style.display = 'none';

    // Create buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.cssText = 'margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px;';

    // Create upload button
    const uploadButton = document.createElement('button');
    uploadButton.textContent = 'Upload Scene XML';
    uploadButton.className = 'upload-button';

    // Create assets button
    const assetsButton = document.createElement('button');
    assetsButton.textContent = 'Add Robot & Asset Files';
    assetsButton.className = 'assets-button';
    assetsButton.style.display = 'none';

    // Create new scene button
    const newSceneButton = document.createElement('button');
    newSceneButton.textContent = 'New Scene';
    newSceneButton.className = 'new-scene-button';
    newSceneButton.style.display = 'none';

    // Create status text
    const statusText = document.createElement('div');
    statusText.className = 'upload-status';

    // Create help toggle
    const helpToggle = document.createElement('div');
    helpToggle.className = 'help-toggle';
    helpToggle.textContent = 'Show instructions';
    helpToggle.style.display = 'block';

    // Create instructions
    const instructions = document.createElement('div');
    instructions.className = 'upload-instructions';
    instructions.style.display = 'none';
    instructions.innerHTML = `
      <strong>How to upload:</strong><br>
      1. Upload your scene XML file<br>
      2. Upload any referenced robot XML files<br>
      3. Upload any referenced assets (STL, OBJ, textures)<br>
      4. The scene will load automatically
    `;

    // Toggle instructions
    helpToggle.addEventListener('click', () => {
      if (instructions.style.display === 'none') {
        instructions.style.display = 'block';
        helpToggle.textContent = 'Hide instructions';
      } else {
        instructions.style.display = 'none';
        helpToggle.textContent = 'Show instructions';
      }
    });

    // Create file list container
    const fileList = document.createElement('div');
    fileList.className = 'file-list';
    fileList.style.display = 'none';

    // Handle drag and drop
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      
      const files = Array.from(e.dataTransfer.files);
      
      // Check if we already have a scene loaded
      if (this.currentUploadPath) {
        // We already have a scene, treat these as additional files
        await this.handleAssetsUpload(files, statusText);
      } else {
        // No scene yet, look for scene XML
        const xmlFile = files.find(f => f.name.endsWith('.xml'));
        
        if (xmlFile) {
          await this.handleXMLUpload(xmlFile, statusText, assetsButton, fileList);
          
          // Handle other files as assets
          const otherFiles = files.filter(f => f !== xmlFile);
          if (otherFiles.length > 0) {
            await this.handleAssetsUpload(otherFiles, statusText);
          }
        } else {
          statusText.textContent = 'Please drop a scene XML file first';
          statusText.className = 'upload-status error';
        }
      }
    });

    // Handle click on drop zone
    dropZone.addEventListener('click', () => xmlInput.click());

    // Handle XML upload
    xmlInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        // Only handle as scene XML if we don't have one yet
        if (!this.currentUploadPath) {
          await this.handleXMLUpload(file, statusText, assetsButton, fileList);
        } else {
          // We already have a scene, treat this as an additional file
          await this.handleAssetsUpload([file], statusText);
        }
      }
    });

    // Handle assets upload
    assetsInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        await this.handleAssetsUpload(files, statusText);
      }
    });

    // Button click handlers
    uploadButton.addEventListener('click', () => {
      if (!this.currentUploadPath) {
        xmlInput.click();
      } else {
        // Already have a scene, use assets input
        assetsInput.click();
      }
    });
    assetsButton.addEventListener('click', () => assetsInput.click());
    newSceneButton.addEventListener('click', () => {
      if (confirm('Start uploading a new scene? This will clear current upload progress.')) {
        this.resetUploadState();
        uploadButton.textContent = 'Upload Scene XML';
        newSceneButton.style.display = 'none';
      }
    });

    // Append elements
    uploadContainer.appendChild(dropZone);
    uploadContainer.appendChild(xmlInput);
    uploadContainer.appendChild(assetsInput);
    buttonsContainer.appendChild(uploadButton);
    buttonsContainer.appendChild(assetsButton);
    buttonsContainer.appendChild(newSceneButton);
    uploadContainer.appendChild(buttonsContainer);
    uploadContainer.appendChild(statusText);
    uploadContainer.appendChild(fileList);
    uploadContainer.appendChild(helpToggle);
    uploadContainer.appendChild(instructions);

    document.body.appendChild(uploadContainer);

    // Add styles
    this.injectStyles();

    return uploadContainer;
  }

  /**
   * Injects CSS styles for the upload interface
   */
  injectStyles() {
    if (document.getElementById('upload-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'upload-styles';
    style.textContent = `
      .upload-container {
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: rgba(30, 35, 45, 0.95);
        padding: 15px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
        z-index: 1000;
        max-width: 280px;
        font-family: Arial, sans-serif;
        color: #e0e0e0;
      }
      
      .drop-zone {
        border: 2px dashed rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        padding: 20px;
        text-align: center;
        cursor: pointer;
        transition: all 0.3s ease;
        background: rgba(255, 255, 255, 0.02);
      }
      
      .drop-zone:hover {
        border-color: #4CAF50;
        background: rgba(76, 175, 80, 0.05);
      }
      
      .drop-zone.dragover {
        border-color: #4CAF50;
        background: rgba(76, 175, 80, 0.1);
      }
      
      .drop-zone-text {
        color: rgba(255, 255, 255, 0.6);
        font-size: 13px;
        pointer-events: none;
        line-height: 1.4;
      }
      
      .upload-button {
        background: #4CAF50;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        margin-right: 8px;
        transition: all 0.3s ease;
      }
      
      .upload-button:hover {
        background: #45a049;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
      }
      
      .assets-button {
        background: #2196F3;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        transition: all 0.3s ease;
      }
      
      .assets-button:hover {
        background: #1976D2;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
      }
      
      .new-scene-button {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.2);
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        margin-left: 8px;
        transition: all 0.3s ease;
      }
      
      .new-scene-button:hover {
        background: rgba(255, 255, 255, 0.15);
        color: rgba(255, 255, 255, 0.9);
        border-color: rgba(255, 255, 255, 0.3);
      }
      
      .upload-status {
        margin-top: 12px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.8);
        line-height: 1.5;
      }
      
      .upload-status.error {
        color: #ff5252;
      }
      
      .upload-status.success {
        color: #4CAF50;
      }
      
      .asset-list {
        margin: 8px 0;
        padding-left: 15px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.6);
      }
      
      .help-toggle {
        display: inline-block;
        margin-top: 10px;
        color: rgba(255, 255, 255, 0.5);
        font-size: 11px;
        cursor: pointer;
        text-decoration: underline;
        transition: color 0.2s ease;
      }
      
      .help-toggle:hover {
        color: rgba(255, 255, 255, 0.8);
      }
      
      .upload-instructions {
        margin-top: 8px;
        padding: 10px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.6);
        line-height: 1.5;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      
      .upload-instructions strong {
        color: rgba(255, 255, 255, 0.8);
      }
      
      .file-list {
        margin-top: 10px;
        max-height: 120px;
        overflow-y: auto;
        font-size: 11px;
      }
      
      .file-list::-webkit-scrollbar {
        width: 6px;
      }
      
      .file-list::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
      }
      
      .file-list::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
      }
      
      .file-list::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
      }
      
      .file-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 8px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
        margin-bottom: 4px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.7);
      }
      
      .file-item .file-name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      .file-item .file-size {
        color: rgba(255, 255, 255, 0.4);
        margin-left: 8px;
        font-size: 10px;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Handles XML file upload
   */
  async handleXMLUpload(file, statusText, assetsButton, fileList) {
    try {
      statusText.textContent = `Loading ${file.name}...`;
      statusText.className = 'upload-status';
      
      const content = await this.readFileAsText(file);
      
      // Validate XML
      this.validateXML(content);
      
      // Parse XML to check for referenced assets and includes
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(content, 'text/xml');
      
      // Extract referenced assets and included XML files
      const references = this.extractReferencedFiles(xmlDoc);
      
      // Create directory structure
      const sceneName = file.name.replace('.xml', '');
      const scenePath = `custom_scenes/${sceneName}`;
      this.currentUploadPath = scenePath;
      
      // Create directories
      this.createDirectory(`/working/custom_scenes`);
      this.createDirectory(`/working/${scenePath}`);
      this.createDirectory(`/working/${scenePath}/assets`);
      
      // Write scene XML file
      this.mujoco.FS.writeFile(`/working/${scenePath}/scene.xml`, content);
      
      // Store upload info
      this.uploadedFiles.set(sceneName, {
        xmlPath: `${scenePath}/scene.xml`,
        includes: new Set(references.includes),
        assets: new Set(references.assets),
        loadedFiles: new Set()
      });
      
      // Update file list display
      fileList.style.display = 'block';
      fileList.innerHTML = '<strong>Uploaded files:</strong>';
      const xmlItem = document.createElement('div');
      xmlItem.className = 'file-item';
      xmlItem.innerHTML = `<span class="file-name">${file.name} (scene)</span><span class="file-size">${this.formatFileSize(file.size)}</span>`;
      fileList.appendChild(xmlItem);
      
      // Update UI to show we have a scene
      const uploadButton = document.querySelector('.upload-button');
      const newSceneButton = document.querySelector('.new-scene-button');
      if (uploadButton) uploadButton.textContent = 'Add More Files';
      if (newSceneButton) newSceneButton.style.display = 'inline-block';
      
      const totalRefs = references.includes.length + references.assets.length;
      if (totalRefs > 0) {
        let statusHTML = `Scene XML loaded! Found ${totalRefs} referenced files:<br>`;
        
        if (references.includes.length > 0) {
          statusHTML += `<div class="asset-list"><strong>Robot/Model files:</strong><br>${references.includes.map(a => `• ${a}`).join('<br>')}</div>`;
        }
        
        if (references.assets.length > 0) {
          statusHTML += `<div class="asset-list"><strong>Asset files:</strong><br>${references.assets.map(a => `• ${a}`).join('<br>')}</div>`;
        }
        
        statusHTML += 'Please upload the referenced files.';
        statusText.innerHTML = statusHTML;
        statusText.className = 'upload-status';
        assetsButton.style.display = 'inline-block';
      } else {
        statusText.textContent = 'Scene XML loaded! Loading scene...';
        statusText.className = 'upload-status success';
        await this.loadUploadedScene(sceneName);
      }
      
    } catch (error) {
      console.error('Error uploading XML:', error);
      statusText.textContent = `Error: ${error.message}`;
      statusText.className = 'upload-status error';
    }
  }

  /**
   * Handles asset files upload (including robot XML files)
   */
  async handleAssetsUpload(files, statusText) {
    if (!this.currentUploadPath) {
      statusText.textContent = 'Please upload scene XML file first!';
      return;
    }

    try {
      const sceneName = this.currentUploadPath.split('/')[1];
      const sceneInfo = this.uploadedFiles.get(sceneName);
      
      // Update file list if visible
      const fileList = document.querySelector('.file-list');
      
      for (const file of files) {
        statusText.textContent = `Loading ${file.name}...`;
        
        // Add to file list display
        if (fileList && fileList.style.display !== 'none') {
          const fileItem = document.createElement('div');
          fileItem.className = 'file-item';
          const fileType = file.name.endsWith('.xml') ? ' (robot model)' : '';
          fileItem.innerHTML = `<span class="file-name">${file.name}${fileType}</span><span class="file-size">${this.formatFileSize(file.size)}</span>`;
          fileList.appendChild(fileItem);
        }
        
        // Determine file type and read accordingly
        let content;
        if (file.name.match(/\.(png|jpg|jpeg)$/i)) {
          content = await this.readFileAsArrayBuffer(file);
          content = new Uint8Array(content);
        } else if (file.name.match(/\.(stl|obj)$/i)) {
          // For STL files, we need to handle binary format
          if (file.name.endsWith('.stl')) {
            content = await this.readFileAsArrayBuffer(file);
            content = new Uint8Array(content);
          } else {
            content = await this.readFileAsText(file);
          }
        } else {
          content = await this.readFileAsText(file);
        }
        
        // Write to filesystem - put XML files in root, assets in assets folder
        let filePath;
        if (file.name.endsWith('.xml')) {
          filePath = `/working/${this.currentUploadPath}/${file.name}`;
        } else {
          filePath = `/working/${this.currentUploadPath}/assets/${file.name}`;
        }
        
        this.mujoco.FS.writeFile(filePath, content);
        sceneInfo.loadedFiles.add(file.name);
      }
      
      // Check if all files are loaded
      const allFiles = [...sceneInfo.includes, ...sceneInfo.assets];
      const missingFiles = allFiles.filter(
        file => ![...sceneInfo.loadedFiles].some(loaded => 
          file.includes(loaded) || loaded.includes(file.split('/').pop())
        )
      );
      
      if (missingFiles.length === 0) {
        statusText.textContent = 'All files loaded! Loading scene...';
        statusText.className = 'upload-status success';
        await this.loadUploadedScene(sceneName);
      } else {
        statusText.innerHTML = `Loaded ${sceneInfo.loadedFiles.size} files. Still missing:<br>
          ${missingFiles.map(f => `• ${f}`).join('<br>')}`;
        statusText.className = 'upload-status';
      }
      
    } catch (error) {
      console.error('Error uploading files:', error);
      statusText.textContent = `Error: ${error.message}`;
      statusText.className = 'upload-status error';
    }
  }

  /**
   * Extracts referenced files from XML (both includes and assets)
   */
  extractReferencedFiles(xmlDoc) {
    const includes = new Set();
    const assets = new Set();
    
    // Check for included XML files (robot models, etc.)
    const includeElements = xmlDoc.querySelectorAll('include');
    includeElements.forEach(include => {
      const file = include.getAttribute('file');
      if (file) includes.add(file);
    });
    
    // Check for mesh files
    const meshes = xmlDoc.querySelectorAll('mesh');
    meshes.forEach(mesh => {
      const file = mesh.getAttribute('file');
      if (file) assets.add(file);
    });
    
    // Check for texture files
    const textures = xmlDoc.querySelectorAll('texture');
    textures.forEach(texture => {
      const file = texture.getAttribute('file');
      if (file) assets.add(file);
    });
    
    // Check for height field files
    const hfields = xmlDoc.querySelectorAll('hfield');
    hfields.forEach(hfield => {
      const file = hfield.getAttribute('file');
      if (file) assets.add(file);
    });
    
    return {
      includes: Array.from(includes),
      assets: Array.from(assets)
    };
  }

  /**
   * Loads the uploaded scene into the simulation
   */
  async loadUploadedScene(sceneName) {
    const sceneInfo = this.uploadedFiles.get(sceneName);
    if (!sceneInfo) {
      throw new Error('Scene info not found');
    }
    
    // Update the scene parameter
    this.parentContext.params.scene = sceneInfo.xmlPath;
    
    // Reload the scene
    await this.parentContext.reloadFunc();
    
    // Add to GUI if not already present
    this.addToSceneSelector(sceneName, sceneInfo.xmlPath);
  }

  /**
   * Adds uploaded scene to the GUI scene selector
   */
  addToSceneSelector(sceneName, xmlPath) {
    // Find the scene controller in GUI
    const gui = this.parentContext.gui;
    if (!gui) return;
    
    // Get the scene controller
    const controllers = gui.controllers;
    const sceneController = controllers.find(c => c.property === 'scene');
    
    if (sceneController) {
      // Get current options
      const currentOptions = sceneController._values || {};
      
      // Add new option
      const newOptions = {
        ...currentOptions,
        [`Custom: ${sceneName}`]: xmlPath
      };
      
      // Update the controller
      sceneController.options(newOptions);
    }
  }

  /**
   * Creates a directory in the virtual filesystem
   */
  createDirectory(path) {
    if (!this.mujoco.FS.analyzePath(path).exists) {
      this.mujoco.FS.mkdir(path);
    }
  }

  /**
   * Reads file as text
   */
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  /**
   * Reads file as ArrayBuffer
   */
  readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Validates XML structure for MuJoCo compatibility
   */
  validateXML(xmlContent) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Check for parse errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error('Invalid XML format');
    }
    
    // Check for mujoco root element
    const mujoco = xmlDoc.querySelector('mujoco');
    if (!mujoco) {
      throw new Error('XML must have <mujoco> as root element');
    }
    
    return true;
  }

  /**
   * Formats file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Resets the upload state for a new scene
   */
  resetUploadState() {
    this.currentUploadPath = null;
    this.uploadedFiles.clear();
    
    // Reset UI
    const fileList = document.querySelector('.file-list');
    if (fileList) {
      fileList.innerHTML = '';
      fileList.style.display = 'none';
    }
    
    const statusText = document.querySelector('.upload-status');
    if (statusText) {
      statusText.textContent = '';
      statusText.className = 'upload-status';
    }
    
    const assetsButton = document.querySelector('.assets-button');
    if (assetsButton) {
      assetsButton.style.display = 'none';
    }
  }
}