# ABSmartly Visual Editor Extension - Complete Implementation Guide

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Data Model](#data-model)
3. [Core Controllers](#core-controllers)
4. [Visual Editor Implementation](#visual-editor-implementation)
5. [Preview Mode Management](#preview-mode-management)
6. [Change Toggle Management](#change-toggle-management)
7. [Undo/Redo System](#undoredo-system)
8. [Complete Implementation Example](#complete-implementation-example)

## Architecture Overview

The extension manages experiments with multiple variants, each containing DOM changes. Users can:
- Preview any variant's changes
- Toggle individual changes on/off during preview
- Use visual editor to create new changes
- Undo/redo changes during visual editing
- Save experiments with all variants and changes to backend

```
┌──────────────────────────────────────┐
│         Chrome Extension              │
├──────────────────────────────────────┤
│  Experiments                          │
│  └── Variants                         │
│      └── DOM Changes (enabled/disabled)│
├──────────────────────────────────────┤
│  Preview Controller                   │
│  - Active variant preview             │
│  - Change toggling                    │
├──────────────────────────────────────┤
│  Visual Editor                        │
│  - Interactive change creation        │
│  - Drag & drop, click to edit        │
│  - Undo/Redo support                  │
├──────────────────────────────────────┤
│  DOM Changes Plugin                   │
│  - Pure DOM manipulation              │
└──────────────────────────────────────┘
```

## Data Model

```javascript
// Experiment structure
const experiment = {
  id: 'exp-123',
  name: 'Homepage Optimization',
  status: 'running',
  variants: [
    {
      id: 'variant-0',
      name: 'Control',
      changes: [] // No changes for control
    },
    {
      id: 'variant-1', 
      name: 'Variant 1',
      changes: [
        {
          id: 'change-1',
          selector: 'div[data-framer-name="home_page_header"] > h1',
          type: 'text',
          value: 'Ok',
          enabled: true // Checkbox state
        },
        {
          id: 'change-2',
          selector: 'a[name="home_page_button"]',
          type: 'style',
          value: { backgroundColor: 'red' },
          enabled: true
        },
        {
          id: 'change-3',
          selector: 'div[data-framer-name="home_page_subtitle"] > p',
          type: 'javascript',
          value: 'element.style.display = "none"',
          enabled: false // Unchecked
        }
      ]
    }
  ],
  variables: [
    { name: 'product_image_s', value: '400px' }
  ]
};
```

## Core Controllers

### Main Extension Controller

```javascript
class ABSmartlyExtension {
  constructor() {
    this.plugin = null;
    this.experiments = new Map(); // All experiments
    this.activeExperiment = null;
    this.activeVariant = null;
    this.previewActive = false;
    this.visualEditorActive = false;
    this.historyManager = null;
    this.visualEditor = null;
  }

  async initialize() {
    // Initialize plugin
    const context = await this.createABSmartlyContext();
    this.plugin = new DOMChangesPlugin({ debug: true, context });
    await this.plugin.initialize();
    
    // Initialize managers
    this.historyManager = new HistoryManager(this.plugin);
    this.visualEditor = new VisualEditor(this.plugin, this.historyManager);
    
    // Load experiments from backend
    await this.loadExperiments();
    
    // Setup listeners
    this.setupMessageListeners();
    this.setupUIListeners();
  }

  async loadExperiments() {
    // Load from backend or storage
    const experiments = await this.fetchExperiments();
    experiments.forEach(exp => {
      this.experiments.set(exp.id, exp);
    });
  }

  // Preview a specific variant
  async startPreview(experimentId, variantId) {
    // Stop current preview if active
    if (this.previewActive) {
      await this.stopPreview();
    }

    const experiment = this.experiments.get(experimentId);
    const variant = experiment.variants.find(v => v.id === variantId);
    
    if (!variant) {
      console.error('Variant not found');
      return false;
    }

    this.activeExperiment = experiment;
    this.activeVariant = variant;
    this.previewActive = true;

    // Apply all enabled changes from this variant
    this.applyVariantChanges(variant);
    
    // Update UI
    this.updateUI({
      previewActive: true,
      experimentId,
      variantId,
      changes: variant.changes
    });

    return true;
  }

  // Stop preview
  async stopPreview() {
    if (!this.previewActive) return;

    // Remove all changes from current variant
    if (this.activeVariant) {
      this.removeVariantChanges(this.activeVariant);
    }

    // Exit visual editor if active
    if (this.visualEditorActive) {
      await this.exitVisualEditor();
    }

    this.previewActive = false;
    this.activeExperiment = null;
    this.activeVariant = null;

    this.updateUI({
      previewActive: false
    });
  }

  // Switch between variants
  async switchVariant(newVariantId) {
    if (!this.activeExperiment) return;

    const newVariant = this.activeExperiment.variants.find(
      v => v.id === newVariantId
    );
    
    if (!newVariant) return;

    // Remove current variant changes
    if (this.activeVariant) {
      this.removeVariantChanges(this.activeVariant);
    }

    // Apply new variant changes
    this.activeVariant = newVariant;
    this.applyVariantChanges(newVariant);

    this.updateUI({
      variantId: newVariantId,
      changes: newVariant.changes
    });
  }

  // Apply all enabled changes from a variant
  applyVariantChanges(variant) {
    variant.changes
      .filter(change => change.enabled)
      .forEach(change => {
        this.plugin.applyChange(change, `${variant.id}-preview`);
      });
  }

  // Remove all changes from a variant
  removeVariantChanges(variant) {
    this.plugin.removeChanges(`${variant.id}-preview`);
  }

  // Toggle individual change on/off
  toggleChange(changeId) {
    if (!this.activeVariant || !this.previewActive) return;

    const change = this.activeVariant.changes.find(c => c.id === changeId);
    if (!change) return;

    change.enabled = !change.enabled;

    if (change.enabled) {
      // Apply this specific change
      this.plugin.applyChange(change, `${this.activeVariant.id}-preview`);
    } else {
      // Remove this specific change
      this.plugin.removeSpecificChange(
        `${this.activeVariant.id}-preview`,
        change.selector,
        change.type
      );
    }

    // Update UI checkbox
    this.updateChangeUI(changeId, change.enabled);
  }

  // Enter visual editor mode
  async enterVisualEditor(variantId) {
    // Start preview if not active
    if (!this.previewActive || this.activeVariant?.id !== variantId) {
      await this.startPreview(this.activeExperiment.id, variantId);
    }

    this.visualEditorActive = true;
    
    // Initialize visual editor
    this.visualEditor.activate(this.activeVariant, (newChange) => {
      // Callback when visual editor creates a new change
      this.handleVisualEditorChange(newChange);
    });

    this.updateUI({
      visualEditorActive: true
    });
  }

  // Exit visual editor
  async exitVisualEditor() {
    if (!this.visualEditorActive) return;

    this.visualEditorActive = false;
    this.visualEditor.deactivate();
    
    // Clear undo/redo history
    this.historyManager.clear();

    this.updateUI({
      visualEditorActive: false
    });
  }

  // Handle new change from visual editor
  handleVisualEditorChange(change) {
    if (!this.activeVariant) return;

    // Generate ID for new change
    change.id = `change-${Date.now()}`;
    change.enabled = true;

    // Add to variant
    this.activeVariant.changes.push(change);

    // Apply immediately
    this.plugin.applyChange(change, `${this.activeVariant.id}-preview`);

    // Add to history for undo/redo
    this.historyManager.addChange(change, this.activeVariant);

    // Update UI
    this.updateChangesListUI(this.activeVariant.changes);
  }

  // Save experiment to backend
  async saveExperiment() {
    if (!this.activeExperiment) return;

    try {
      await fetch('/api/experiments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.activeExperiment)
      });

      this.showNotification('Experiment saved successfully');
    } catch (error) {
      this.showNotification('Failed to save experiment', 'error');
    }
  }

  updateUI(state) {
    chrome.runtime.sendMessage({
      type: 'UI_UPDATE',
      state
    });
  }

  updateChangeUI(changeId, enabled) {
    chrome.runtime.sendMessage({
      type: 'CHANGE_TOGGLED',
      changeId,
      enabled
    });
  }

  updateChangesListUI(changes) {
    chrome.runtime.sendMessage({
      type: 'CHANGES_UPDATED',
      changes
    });
  }

  showNotification(message, level = 'success') {
    chrome.runtime.sendMessage({
      type: 'NOTIFICATION',
      message,
      level
    });
  }
}
```

## Visual Editor Implementation

```javascript
class VisualEditor {
  constructor(plugin, historyManager) {
    this.plugin = plugin;
    this.historyManager = historyManager;
    this.active = false;
    this.selectedElement = null;
    this.variant = null;
    this.onChangeCallback = null;
    this.overlay = null;
    this.toolbar = null;
    this.draggedElement = null;
  }

  activate(variant, onChangeCallback) {
    this.active = true;
    this.variant = variant;
    this.onChangeCallback = onChangeCallback;
    
    // Create UI overlay
    this.createOverlay();
    this.createToolbar();
    
    // Setup interaction handlers
    this.setupInteractionHandlers();
    
    // Make page interactive
    this.makePageInteractive();
  }

  deactivate() {
    this.active = false;
    this.removeOverlay();
    this.removeToolbar();
    this.removeInteractionHandlers();
    this.selectedElement = null;
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'absmartly-visual-editor-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 999998;
    `;
    document.body.appendChild(this.overlay);
  }

  createToolbar() {
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'absmartly-visual-editor-toolbar';
    this.toolbar.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 8px;
      padding: 10px;
      z-index: 999999;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    `;
    
    this.toolbar.innerHTML = `
      <div style="display: flex; gap: 10px;">
        <button id="ve-undo">↶ Undo</button>
        <button id="ve-redo">↷ Redo</button>
        <button id="ve-done">✓ Done</button>
      </div>
      <div id="ve-info" style="margin-top: 10px; font-size: 12px;">
        Click to edit • Drag to move • Right-click for options
      </div>
    `;
    
    document.body.appendChild(this.toolbar);
    
    // Setup toolbar buttons
    this.toolbar.querySelector('#ve-undo').onclick = () => this.undo();
    this.toolbar.querySelector('#ve-redo').onclick = () => this.redo();
    this.toolbar.querySelector('#ve-done').onclick = () => this.done();
  }

  setupInteractionHandlers() {
    // Click handler for text editing
    this.clickHandler = (e) => {
      if (this.isToolbarElement(e.target)) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      this.selectElement(e.target);
      this.showEditOptions(e.target);
    };

    // Double-click for inline text editing
    this.dblClickHandler = (e) => {
      if (this.isToolbarElement(e.target)) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      this.startInlineEdit(e.target);
    };

    // Drag and drop for moving elements
    this.dragStartHandler = (e) => {
      if (this.isToolbarElement(e.target)) return;
      
      this.draggedElement = e.target;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', e.target.innerHTML);
      e.target.style.opacity = '0.5';
    };

    this.dragOverHandler = (e) => {
      if (e.preventDefault) {
        e.preventDefault();
      }
      e.dataTransfer.dropEffect = 'move';
      
      // Highlight drop target
      e.target.style.outline = '2px dashed #4A90E2';
      return false;
    };

    this.dragLeaveHandler = (e) => {
      e.target.style.outline = '';
    };

    this.dropHandler = (e) => {
      if (e.stopPropagation) {
        e.stopPropagation();
      }
      
      e.target.style.outline = '';
      
      if (this.draggedElement && this.draggedElement !== e.target) {
        // Create move change
        this.createMoveChange(this.draggedElement, e.target);
      }
      
      return false;
    };

    this.dragEndHandler = (e) => {
      e.target.style.opacity = '';
      this.draggedElement = null;
    };

    // Right-click for context menu
    this.contextMenuHandler = (e) => {
      if (this.isToolbarElement(e.target)) return;
      
      e.preventDefault();
      this.showContextMenu(e.target, e.pageX, e.pageY);
    };

    // Keyboard shortcuts
    this.keyboardHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        this.redo();
      } else if (e.key === 'Escape') {
        this.cancelCurrentOperation();
      }
    };

    // Add all handlers
    document.addEventListener('click', this.clickHandler, true);
    document.addEventListener('dblclick', this.dblClickHandler, true);
    document.addEventListener('contextmenu', this.contextMenuHandler, true);
    document.addEventListener('keydown', this.keyboardHandler, true);
  }

  makePageInteractive() {
    // Make all elements draggable
    const elements = document.querySelectorAll('*:not(script):not(style):not(head)');
    elements.forEach(el => {
      if (this.isToolbarElement(el)) return;
      
      el.draggable = true;
      el.addEventListener('dragstart', this.dragStartHandler);
      el.addEventListener('dragover', this.dragOverHandler);
      el.addEventListener('dragleave', this.dragLeaveHandler);
      el.addEventListener('drop', this.dropHandler);
      el.addEventListener('dragend', this.dragEndHandler);
      
      // Visual feedback on hover
      el.addEventListener('mouseenter', () => {
        if (!this.active) return;
        el.style.outline = '1px solid #4A90E2';
        el.style.cursor = 'pointer';
      });
      
      el.addEventListener('mouseleave', () => {
        if (!this.active) return;
        if (el !== this.selectedElement) {
          el.style.outline = '';
        }
        el.style.cursor = '';
      });
    });
  }

  selectElement(element) {
    // Clear previous selection
    if (this.selectedElement) {
      this.selectedElement.style.outline = '';
    }
    
    this.selectedElement = element;
    element.style.outline = '2px solid #4A90E2';
    
    // Update toolbar info
    const info = this.toolbar.querySelector('#ve-info');
    info.textContent = `Selected: ${element.tagName.toLowerCase()}${element.className ? '.' + element.className : ''}`;
  }

  startInlineEdit(element) {
    const originalText = element.textContent;
    
    // Make element editable
    element.contentEditable = true;
    element.focus();
    
    // Select all text
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Save on Enter or blur
    const saveEdit = () => {
      element.contentEditable = false;
      const newText = element.textContent;
      
      if (newText !== originalText) {
        this.createTextChange(element, newText, originalText);
      }
    };
    
    element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        element.textContent = originalText;
        element.contentEditable = false;
      }
    }, { once: true });
    
    element.addEventListener('blur', saveEdit, { once: true });
  }

  showEditOptions(element) {
    // Create floating edit panel
    const panel = document.createElement('div');
    panel.className = 'absmartly-edit-panel';
    panel.style.cssText = `
      position: absolute;
      background: white;
      border: 1px solid #ccc;
      border-radius: 8px;
      padding: 10px;
      z-index: 999999;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    `;
    
    const rect = element.getBoundingClientRect();
    panel.style.left = rect.left + 'px';
    panel.style.top = (rect.bottom + 10) + 'px';
    
    panel.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 5px;">
        <button onclick="this.editText()">Edit Text</button>
        <button onclick="this.editStyles()">Edit Styles</button>
        <button onclick="this.addClass()">Add Class</button>
        <button onclick="this.addAttribute()">Add Attribute</button>
        <button onclick="this.insertElement()">Insert Element</button>
        <button onclick="this.deleteElement()">Delete Element</button>
      </div>
    `;
    
    // Attach methods to buttons
    panel.editText = () => {
      this.startInlineEdit(element);
      panel.remove();
    };
    
    panel.editStyles = () => {
      this.showStyleEditor(element);
      panel.remove();
    };
    
    panel.addClass = () => {
      const className = prompt('Enter class name:');
      if (className) {
        this.createClassChange(element, [className], 'add');
      }
      panel.remove();
    };
    
    panel.addAttribute = () => {
      const name = prompt('Attribute name:');
      const value = prompt('Attribute value:');
      if (name) {
        this.createAttributeChange(element, { [name]: value });
      }
      panel.remove();
    };
    
    panel.insertElement = () => {
      this.showInsertElementDialog(element);
      panel.remove();
    };
    
    panel.deleteElement = () => {
      if (confirm('Delete this element?')) {
        this.createRemoveChange(element);
      }
      panel.remove();
    };
    
    document.body.appendChild(panel);
    
    // Remove panel on outside click
    setTimeout(() => {
      document.addEventListener('click', () => panel.remove(), { once: true });
    }, 100);
  }

  showStyleEditor(element) {
    const modal = document.createElement('div');
    modal.className = 'absmartly-style-editor';
    modal.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border: 1px solid #ccc;
      border-radius: 8px;
      padding: 20px;
      z-index: 999999;
      box-shadow: 0 2px 20px rgba(0,0,0,0.2);
      min-width: 300px;
    `;
    
    modal.innerHTML = `
      <h3>Edit Styles</h3>
      <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px; margin: 20px 0;">
        <label>Color:</label>
        <input type="color" id="style-color" value="#000000">
        
        <label>Background:</label>
        <input type="color" id="style-bg" value="#ffffff">
        
        <label>Font Size:</label>
        <input type="text" id="style-fontSize" placeholder="16px">
        
        <label>Padding:</label>
        <input type="text" id="style-padding" placeholder="10px">
        
        <label>Margin:</label>
        <input type="text" id="style-margin" placeholder="0">
        
        <label>Border:</label>
        <input type="text" id="style-border" placeholder="1px solid #ccc">
      </div>
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button id="style-cancel">Cancel</button>
        <button id="style-apply">Apply</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Apply button
    modal.querySelector('#style-apply').onclick = () => {
      const styles = {};
      
      const color = modal.querySelector('#style-color').value;
      if (color !== '#000000') styles.color = color;
      
      const bg = modal.querySelector('#style-bg').value;
      if (bg !== '#ffffff') styles.backgroundColor = bg;
      
      const fontSize = modal.querySelector('#style-fontSize').value;
      if (fontSize) styles.fontSize = fontSize;
      
      const padding = modal.querySelector('#style-padding').value;
      if (padding) styles.padding = padding;
      
      const margin = modal.querySelector('#style-margin').value;
      if (margin) styles.margin = margin;
      
      const border = modal.querySelector('#style-border').value;
      if (border) styles.border = border;
      
      if (Object.keys(styles).length > 0) {
        this.createStyleChange(element, styles);
      }
      
      modal.remove();
    };
    
    // Cancel button
    modal.querySelector('#style-cancel').onclick = () => modal.remove();
  }

  showInsertElementDialog(targetElement) {
    const modal = document.createElement('div');
    modal.className = 'absmartly-insert-dialog';
    modal.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border: 1px solid #ccc;
      border-radius: 8px;
      padding: 20px;
      z-index: 999999;
      box-shadow: 0 2px 20px rgba(0,0,0,0.2);
    `;
    
    modal.innerHTML = `
      <h3>Insert Element</h3>
      <div style="margin: 20px 0;">
        <label>Element Type:</label>
        <select id="insert-type" style="width: 100%; margin: 10px 0;">
          <option value="div">DIV</option>
          <option value="p">Paragraph</option>
          <option value="span">Span</option>
          <option value="button">Button</option>
          <option value="a">Link</option>
          <option value="img">Image</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
        
        <label>Content/Text:</label>
        <input type="text" id="insert-content" style="width: 100%; margin: 10px 0;">
        
        <label>Position:</label>
        <select id="insert-position" style="width: 100%; margin: 10px 0;">
          <option value="firstChild">First Child</option>
          <option value="lastChild">Last Child</option>
          <option value="before">Before Element</option>
          <option value="after">After Element</option>
        </select>
      </div>
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button id="insert-cancel">Cancel</button>
        <button id="insert-create">Create</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('#insert-create').onclick = () => {
      const type = modal.querySelector('#insert-type').value;
      const content = modal.querySelector('#insert-content').value;
      const position = modal.querySelector('#insert-position').value;
      
      let html = `<${type}>`;
      if (content) {
        html += content;
      }
      html += `</${type}>`;
      
      this.createInsertChange(targetElement, html, position);
      modal.remove();
    };
    
    modal.querySelector('#insert-cancel').onclick = () => modal.remove();
  }

  showContextMenu(element, x, y) {
    const menu = document.createElement('div');
    menu.className = 'absmartly-context-menu';
    menu.style.cssText = `
      position: absolute;
      left: ${x}px;
      top: ${y}px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 5px 0;
      z-index: 999999;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    `;
    
    const menuItems = [
      { label: 'Edit Text', action: () => this.startInlineEdit(element) },
      { label: 'Edit Styles', action: () => this.showStyleEditor(element) },
      { label: 'Duplicate', action: () => this.duplicateElement(element) },
      { label: 'Delete', action: () => this.createRemoveChange(element) },
      { label: '---' },
      { label: 'Copy Selector', action: () => this.copySelector(element) },
      { label: 'Inspect', action: () => console.log(element) }
    ];
    
    menuItems.forEach(item => {
      if (item.label === '---') {
        const divider = document.createElement('hr');
        divider.style.margin = '5px 0';
        menu.appendChild(divider);
      } else {
        const menuItem = document.createElement('div');
        menuItem.textContent = item.label;
        menuItem.style.cssText = `
          padding: 8px 20px;
          cursor: pointer;
        `;
        menuItem.onmouseover = () => menuItem.style.background = '#f0f0f0';
        menuItem.onmouseout = () => menuItem.style.background = '';
        menuItem.onclick = () => {
          item.action();
          menu.remove();
        };
        menu.appendChild(menuItem);
      }
    });
    
    document.body.appendChild(menu);
    
    // Remove on outside click
    setTimeout(() => {
      document.addEventListener('click', () => menu.remove(), { once: true });
    }, 100);
  }

  // Create different types of changes
  createTextChange(element, newText, originalText) {
    const change = {
      selector: this.generateSelector(element),
      type: 'text',
      value: newText,
      originalValue: originalText
    };
    
    this.applyAndTrackChange(change);
  }

  createStyleChange(element, styles) {
    const change = {
      selector: this.generateSelector(element),
      type: 'style',
      value: styles
    };
    
    this.applyAndTrackChange(change);
  }

  createClassChange(element, classes, action) {
    const change = {
      selector: this.generateSelector(element),
      type: 'class',
      [action]: classes
    };
    
    this.applyAndTrackChange(change);
  }

  createAttributeChange(element, attributes) {
    const change = {
      selector: this.generateSelector(element),
      type: 'attribute',
      value: attributes
    };
    
    this.applyAndTrackChange(change);
  }

  createMoveChange(element, target) {
    const change = {
      selector: this.generateSelector(element),
      type: 'move',
      targetSelector: this.generateSelector(target),
      position: 'lastChild'
    };
    
    this.applyAndTrackChange(change);
  }

  createInsertChange(target, html, position) {
    const change = {
      selector: `inserted-element-${Date.now()}`,
      type: 'create',
      element: html,
      targetSelector: this.generateSelector(target),
      position: position
    };
    
    this.applyAndTrackChange(change);
  }

  createRemoveChange(element) {
    const change = {
      selector: this.generateSelector(element),
      type: 'remove'
    };
    
    this.applyAndTrackChange(change);
  }

  applyAndTrackChange(change) {
    // Apply the change
    this.plugin.applyChange(change, `${this.variant.id}-preview`);
    
    // Track in history for undo/redo
    this.historyManager.addChange(change, this.variant);
    
    // Notify parent controller
    if (this.onChangeCallback) {
      this.onChangeCallback(change);
    }
  }

  generateSelector(element) {
    // Generate a unique selector for the element
    if (element.id) {
      return `#${element.id}`;
    }
    
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c);
      if (classes.length > 0) {
        return `.${classes.join('.')}`;
      }
    }
    
    // Use data attributes if available
    const dataAttrs = Array.from(element.attributes)
      .filter(attr => attr.name.startsWith('data-'));
    
    if (dataAttrs.length > 0) {
      const selector = dataAttrs
        .map(attr => `[${attr.name}="${attr.value}"]`)
        .join('');
      return element.tagName.toLowerCase() + selector;
    }
    
    // Fallback to path-based selector
    const path = [];
    let current = element;
    
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector = `#${current.id}`;
        path.unshift(selector);
        break;
      }
      
      const siblings = Array.from(current.parentNode.children);
      const index = siblings.indexOf(current);
      
      if (siblings.length > 1) {
        selector += `:nth-child(${index + 1})`;
      }
      
      path.unshift(selector);
      current = current.parentNode;
    }
    
    return path.join(' > ');
  }

  undo() {
    this.historyManager.undo();
    this.updateToolbarState();
  }

  redo() {
    this.historyManager.redo();
    this.updateToolbarState();
  }

  updateToolbarState() {
    const undoBtn = this.toolbar.querySelector('#ve-undo');
    const redoBtn = this.toolbar.querySelector('#ve-redo');
    
    undoBtn.disabled = !this.historyManager.canUndo();
    redoBtn.disabled = !this.historyManager.canRedo();
  }

  done() {
    // Exit visual editor
    window.visualEditorExtension.exitVisualEditor();
  }

  cancelCurrentOperation() {
    // Cancel any ongoing operation
    if (this.selectedElement) {
      this.selectedElement.style.outline = '';
      this.selectedElement = null;
    }
  }

  isToolbarElement(element) {
    return element.closest('.absmartly-visual-editor-toolbar') ||
           element.closest('.absmartly-edit-panel') ||
           element.closest('.absmartly-style-editor') ||
           element.closest('.absmartly-context-menu') ||
           element.closest('.absmartly-insert-dialog');
  }

  removeOverlay() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  removeToolbar() {
    if (this.toolbar) {
      this.toolbar.remove();
      this.toolbar = null;
    }
  }

  removeInteractionHandlers() {
    document.removeEventListener('click', this.clickHandler, true);
    document.removeEventListener('dblclick', this.dblClickHandler, true);
    document.removeEventListener('contextmenu', this.contextMenuHandler, true);
    document.removeEventListener('keydown', this.keyboardHandler, true);
    
    // Remove drag handlers from all elements
    const elements = document.querySelectorAll('*[draggable="true"]');
    elements.forEach(el => {
      el.draggable = false;
      el.removeEventListener('dragstart', this.dragStartHandler);
      el.removeEventListener('dragover', this.dragOverHandler);
      el.removeEventListener('dragleave', this.dragLeaveHandler);
      el.removeEventListener('drop', this.dropHandler);
      el.removeEventListener('dragend', this.dragEndHandler);
      el.style.outline = '';
      el.style.cursor = '';
    });
  }

  duplicateElement(element) {
    const clone = element.cloneNode(true);
    element.parentNode.insertBefore(clone, element.nextSibling);
    
    // Create an insert change for the duplicate
    this.createInsertChange(
      element.parentNode,
      clone.outerHTML,
      'after'
    );
  }

  copySelector(element) {
    const selector = this.generateSelector(element);
    navigator.clipboard.writeText(selector);
    this.showNotification('Selector copied to clipboard');
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 10px 20px;
      border-radius: 4px;
      z-index: 999999;
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 3000);
  }
}
```

## Undo/Redo System

```javascript
class HistoryManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.undoStack = [];
    this.redoStack = [];
    this.variant = null;
  }

  addChange(change, variant) {
    this.variant = variant;
    
    // Add to undo stack
    this.undoStack.push({
      action: 'ADD',
      change: change,
      timestamp: Date.now()
    });
    
    // Clear redo stack when new action is performed
    this.redoStack = [];
    
    this.updateUI();
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    
    const action = this.undoStack.pop();
    
    if (action.action === 'ADD') {
      // Remove the change from variant
      const index = this.variant.changes.findIndex(
        c => c.selector === action.change.selector && 
             c.type === action.change.type
      );
      
      if (index !== -1) {
        this.variant.changes.splice(index, 1);
      }
      
      // Remove from DOM
      this.plugin.removeSpecificChange(
        `${this.variant.id}-preview`,
        action.change.selector,
        action.change.type
      );
    }
    
    // Add to redo stack
    this.redoStack.push(action);
    
    this.updateUI();
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    
    const action = this.redoStack.pop();
    
    if (action.action === 'ADD') {
      // Re-add the change to variant
      this.variant.changes.push(action.change);
      
      // Re-apply to DOM
      this.plugin.applyChange(
        action.change,
        `${this.variant.id}-preview`
      );
    }
    
    // Add back to undo stack
    this.undoStack.push(action);
    
    this.updateUI();
    return true;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.variant = null;
    this.updateUI();
  }

  updateUI() {
    chrome.runtime.sendMessage({
      type: 'HISTORY_UPDATE',
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length
    });
  }
}
```

## Complete Implementation Example

```javascript
// content-script.js
(async function() {
  // Initialize the extension
  const extension = new ABSmartlyExtension();
  await extension.initialize();
  
  // Make it globally available
  window.visualEditorExtension = extension;
  
  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case 'START_PREVIEW':
        extension.startPreview(request.experimentId, request.variantId);
        break;
        
      case 'STOP_PREVIEW':
        extension.stopPreview();
        break;
        
      case 'SWITCH_VARIANT':
        extension.switchVariant(request.variantId);
        break;
        
      case 'TOGGLE_CHANGE':
        extension.toggleChange(request.changeId);
        break;
        
      case 'ENTER_VISUAL_EDITOR':
        extension.enterVisualEditor(request.variantId);
        break;
        
      case 'EXIT_VISUAL_EDITOR':
        extension.exitVisualEditor();
        break;
        
      case 'SAVE_EXPERIMENT':
        extension.saveExperiment();
        break;
        
      case 'GET_STATE':
        sendResponse({
          experiments: Array.from(extension.experiments.values()),
          activeExperiment: extension.activeExperiment,
          activeVariant: extension.activeVariant,
          previewActive: extension.previewActive,
          visualEditorActive: extension.visualEditorActive
        });
        return true;
    }
  });
  
  console.log('ABSmartly Visual Editor Extension loaded');
})();
```

## Key Features Summary

1. **Experiment & Variant Management**
   - Multiple experiments with multiple variants
   - Each variant contains DOM changes
   - Changes can be enabled/disabled individually

2. **Preview Mode**
   - Preview any variant's changes
   - Toggle individual changes on/off during preview
   - Switch between variants seamlessly

3. **Visual Editor**
   - Click to edit text inline
   - Drag & drop to move elements
   - Right-click context menu for advanced options
   - Style editor with visual controls
   - Insert new elements
   - Delete elements

4. **Undo/Redo**
   - Full history tracking during visual editing
   - Keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z)
   - Visual buttons in toolbar

5. **Change Types Supported**
   - Text changes
   - Style changes
   - Class additions/removals
   - Attribute changes
   - Element moves
   - Element creation
   - Element deletion
   - JavaScript execution

6. **User Workflow**
   - Select experiment and variant
   - Click "Preview" to see changes
   - Toggle individual changes on/off
   - Click "Visual Editor" to make new changes
   - Use undo/redo during editing
   - Save experiment when done

This implementation provides a complete visual editing experience while maintaining clean separation between the extension logic and the DOM manipulation plugin.