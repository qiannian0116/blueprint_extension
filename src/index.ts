import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { Widget, PanelLayout } from '@lumino/widgets';
import { fileIcon } from '@jupyterlab/ui-components';
import { IFileBrowserFactory } from '@jupyterlab/filebrowser';
import JSZip from 'jszip';

/**
 * Initialization data for the jupyterlab_dynamic extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-dynamic',
  autoStart: true,
  requires: [ICommandPalette, IFileBrowserFactory],
  activate: (app: JupyterFrontEnd, palette: ICommandPalette, fileBrowserFactory: IFileBrowserFactory) => {
    console.log('JupyterLab extension jupyterlab_dynamic is activated!');

    class DynamicPanel extends Widget {
      constructor() {
        super();
        this.id = 'dynamic-jupyterlab';
        this.title.label = '';
        this.title.closable = true;
        this.title.icon = fileIcon;
        this.addClass('jp-dynamicPanel');

        this.node.style.overflowY = 'auto';
        this.node.style.maxHeight = '1300px';

        const layout = new PanelLayout();
        this.layout = layout;

        const buttonRow = this.createButtonRow();
        layout.addWidget(new Widget({ node: buttonRow }));

        const formContainer = this.createFormFields();
        layout.addWidget(new Widget({ node: formContainer }));

        // 动态创建 CMD 和 DEPEND 容器
        const cmdContainer = this.createSection('CMD', 'cmd-container');
        const dependContainer = this.createSection('DEPEND', 'depend-container');

        layout.addWidget(new Widget({ node: cmdContainer }));
        layout.addWidget(new Widget({ node: dependContainer }));

        const confirmButton = this.createConfirmButton();
        layout.addWidget(new Widget({ node: confirmButton }));
      }

      createButtonRow(): HTMLElement {
        const buttonRow = document.createElement('div');
        buttonRow.style.display = 'flex';
        buttonRow.style.justifyContent = 'space-between';
        buttonRow.style.marginBottom = '20px';

        const parseCodeButton = document.createElement('button');
        parseCodeButton.textContent = '解析代码生成蓝图';
        parseCodeButton.onclick = async () => {
          console.log('解析代码生成蓝图按钮被点击');
          await this.zipAndSendCurrentDirectory(); // 打包并发送当前目录的文件
        };

        const parseLocalFileButton = document.createElement('button');
        parseLocalFileButton.textContent = '解析本地蓝图文件';
        parseLocalFileButton.onclick = async () => {
          console.log('解析本地蓝图文件按钮被点击');
          await this.loadBlueprintFile(); // 解析本地 blueprint.json 文件
        };

        buttonRow.appendChild(parseCodeButton);
        buttonRow.appendChild(parseLocalFileButton);

        return buttonRow;
      }

      async loadBlueprintFile(): Promise<void> {
        const currentWidget = fileBrowserFactory.tracker.currentWidget;

        if (!currentWidget) {
          console.error('No file browser widget is currently open or focused.');
          return;
        }

        const currentPath = currentWidget.model.path;
        const blueprintFileName = `${currentPath}/blueprint.json`;

        const documentManager = currentWidget.model.manager;

        try {
          const blueprintFile = await documentManager.services.contents.get(blueprintFileName, { content: true });
          const blueprintData = JSON.parse(blueprintFile.content);
          this.parseBlueprintData(blueprintData);
        } catch (error) {
          console.error('Error loading blueprint.json:', error);
        }
      }

      async zipAndSendCurrentDirectory(): Promise<void> {
        const currentWidget = fileBrowserFactory.tracker.currentWidget;
      
        if (!currentWidget) {
          console.error('No file browser widget is currently open or focused.');
          return;
        }
      
        const currentPath = currentWidget.model.path;
        const documentManager = currentWidget.model.manager;
        const fileItems = await documentManager.services.contents.get(currentPath);
      
        const zip = new JSZip();
        const folder = zip.folder("test")!;
      
        for (const item of fileItems.content) {
          if (item.type === 'file') {
            const fileContent = await documentManager.services.contents.get(item.path, { content: true });
            folder.file(item.name, fileContent.content, { base64: true });
          }
        }
      
        const zipContent = await zip.generateAsync({ type: "base64" });
        const zipFileName = 'test.zip';
      
        // 将 zip 文件发送到服务器
        const formData = new FormData();
        formData.append('file', new Blob([zipContent], { type: 'application/zip' }), zipFileName);
      
        fetch('http://172.16.32.12:8080/upload', {
          method: 'POST',
          body: formData
        })
          .then(response => response.json()) // 假设服务器返回 JSON 文件
          .then(async data => {
            console.log('Blueprint JSON received:', data);
            await this.parseBlueprintData(data); // 解析并加载数据到表单
          })
          .catch(error => {
            console.error('Error uploading file or receiving blueprint.json:', error);
          });
      }
      
      // 解析返回的 Blueprint JSON 数据并加载到表单中
      async parseBlueprintData(blueprintData: any): Promise<void> {
        (document.getElementById('blueprint') as HTMLInputElement).value = blueprintData['BLUEPRINT'] || '';
        (document.getElementById('name') as HTMLInputElement).value = blueprintData['NAME'] || '';
        (document.getElementById('type') as HTMLInputElement).value = blueprintData['TYPE'] || '';
        (document.getElementById('version') as HTMLInputElement).value = blueprintData['VERSION'] || '';
        (document.getElementById('environment') as HTMLInputElement).value = blueprintData['ENVIRONMENT'] || '';
        (document.getElementById('workdir') as HTMLInputElement).value = blueprintData['WORKDIR'] || '';
      
        const cmdContainer = document.getElementById('cmd-container');
        if (cmdContainer) {
          cmdContainer.innerHTML = '';  
          blueprintData['CMD'].forEach((cmd: string) => {
            const cmdRow = this.createRowWithInput(cmd);
            cmdContainer.appendChild(cmdRow);
          });
        }
      
        const dependContainer = document.getElementById('depend-container');
        if (dependContainer) {
          dependContainer.innerHTML = '';  
          blueprintData['DEPEND'].forEach((depend: string) => {
            const dependRow = this.createRowWithInput(depend);
            dependContainer.appendChild(dependRow);
          });
        }
      
        console.log('Blueprint JSON parsed and loaded into the form.');
      }
      
      createFormFields(): HTMLElement {
        const formContainer = document.createElement('div');
        const fields = [
          { label: 'BLUEPRINT', placeholder: 'Blueprint input...' },
          { label: 'NAME', placeholder: 'Name input...' },
          { label: 'TYPE', placeholder: 'Type input...' },
          { label: 'VERSION', placeholder: 'Version input...' },
          { label: 'ENVIRONMENT', placeholder: 'Environment input...' },
          { label: 'WORKDIR', placeholder: 'Workdir input...' }
        ];

        fields.forEach(field => {
          const fieldRow = document.createElement('div');
          fieldRow.style.display = 'flex';
          fieldRow.style.alignItems = 'center';
          fieldRow.style.marginBottom = '10px';

          const label = document.createElement('div');
          label.textContent = field.label;
          label.style.width = '150px';
          label.style.fontWeight = 'bold';

          const input = document.createElement('input');
          input.type = 'text';
          input.style.flex = '1';
          input.placeholder = field.placeholder;
          input.id = field.label.toLowerCase(); 

          fieldRow.appendChild(label);
          fieldRow.appendChild(input);
          formContainer.appendChild(fieldRow);
        });

        formContainer.style.marginBottom = '20px';
        return formContainer;
      }

      createSection(sectionName: string, containerId: string): HTMLElement {
        const container = document.createElement('div');
        container.style.marginBottom = '20px';

        const labelRow = document.createElement('div');
        labelRow.style.display = 'flex';
        labelRow.style.alignItems = 'center';
        labelRow.style.justifyContent = 'space-between';

        const label = document.createElement('div');
        label.textContent = sectionName;
        label.style.fontWeight = 'bold';

        const addButton = this.createAddButton(container, sectionName);
        labelRow.appendChild(label);
        labelRow.appendChild(addButton);

        container.appendChild(labelRow);

        const inputContainer = document.createElement('div');
        inputContainer.id = containerId;  
        container.appendChild(inputContainer);

        return container;
      }

      createAddButton(inputContainer: HTMLElement, sectionName: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.textContent = '+';
        button.classList.add('jp-AddButton');
        button.style.marginLeft = '10px';
        button.onclick = () => {
          // 根据 sectionName 确定是 CMD 还是 DEPEND
          if (sectionName === 'CMD') {
            this.addRow(document.getElementById('cmd-container')!, 'CMD');
          } else if (sectionName === 'DEPEND') {
            this.addRow(document.getElementById('depend-container')!, 'DEPEND');
          }
        };
        return button;
      }      

      createRemoveButton(row: HTMLElement): HTMLButtonElement {
        const button = document.createElement('button');
        button.textContent = '-';
        button.classList.add('jp-RemoveButton');
        button.style.marginLeft = '10px';
        button.onclick = () => {
          row.remove();
        };
        return button;
      }

      addRow(inputContainer: HTMLElement, sectionName: string): void {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.marginBottom = '10px';
      
        const input = document.createElement('input');
        input.type = 'text';
        input.style.flex = '1';
        input.placeholder = `${sectionName} input...`;
      
        const removeButton = this.createRemoveButton(row);
      
        row.appendChild(removeButton);
        row.appendChild(input);
        inputContainer.appendChild(row);
      
        // 添加调试信息，确认新行已添加
        console.log(`Added new ${sectionName} row`, input);
      
        // 修正选择器，确保捕获正确的输入框
        const containerId = inputContainer.id; // 获取输入容器的 id
        setTimeout(() => {
          // 确保我们在正确的容器中选择输入框
          if (containerId) {
            console.log(`Current ${sectionName} inputs:`, document.querySelectorAll(`#${containerId} input`));
          } else {
            console.error('Invalid containerId:', containerId);
          }
        }, 100);
      }      

      createConfirmButton(): HTMLElement {
        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '20px';
        buttonContainer.style.textAlign = 'center';

        const confirmButton = document.createElement('button');
        confirmButton.textContent = '确认蓝图';
        confirmButton.style.padding = '10px 20px';
        confirmButton.onclick = async () => {
          console.log('确认蓝图按钮被点击');
          await this.saveBlueprintAsTestJson(); 
        };

        buttonContainer.appendChild(confirmButton);
        return buttonContainer;
      }

      async saveBlueprintAsTestJson(): Promise<void> {
        const blueprintData = {
          BLUEPRINT: (document.getElementById('blueprint') as HTMLInputElement).value,
          NAME: (document.getElementById('name') as HTMLInputElement).value,
          TYPE: (document.getElementById('type') as HTMLInputElement).value,
          VERSION: (document.getElementById('version') as HTMLInputElement).value,
          ENVIRONMENT: (document.getElementById('environment') as HTMLInputElement).value,
          WORKDIR: (document.getElementById('workdir') as HTMLInputElement).value,
          CMD: Array.from(document.querySelectorAll('#cmd-container input')).map(
            input => (input as HTMLInputElement).value
          ),
          DEPEND: Array.from(document.querySelectorAll('#depend-container input')).map(
            input => (input as HTMLInputElement).value
          ),
        };
      
        console.log('Captured CMD values:', blueprintData.CMD);
        console.log('Captured DEPEND values:', blueprintData.DEPEND);
      
        const currentWidget = fileBrowserFactory.tracker.currentWidget;
      
        if (!currentWidget) {
          console.error('No file browser widget is currently open or focused.');
          return;
        }
      
        const currentPath = currentWidget.model.path;
        const blueprintFileName = `${currentPath}/blueprint.json`;
      
        const documentManager = currentWidget.model.manager;
      
        // 生成 JSON 文件
        const jsonData = JSON.stringify(blueprintData, null, 2);
      
        // 将 JSON 数据发送到服务器
        const formData = new FormData();
        formData.append('file', new Blob([jsonData], { type: 'application/json' }), 'blueprint.json');
      
        fetch('http://172.16.32.12:8080/blueprint', {
          method: 'POST',
          body: formData
        })
          .then(response => response.json())
          .then(async (serverData) => {
            // 将服务器返回的 blueprint.json 文件保存到当前目录
            await documentManager.services.contents.save(blueprintFileName, {
              type: 'file',
              format: 'text',
              content: JSON.stringify(serverData, null, 2), // 格式化保存服务器返回的 blueprint.json
            });
      
            console.log('服务器返回的 blueprint.json 文件已保存到当前目录');
          })
          .catch(error => {
            console.error('Error uploading blueprint or receiving response:', error);
          });
      }
      

      createRowWithInput(initialValue: string): HTMLElement {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.marginBottom = '10px';

        const input = document.createElement('input');
        input.type = 'text';
        input.style.flex = '1';
        input.value = initialValue;

        const removeButton = this.createRemoveButton(row);

        row.appendChild(removeButton);
        row.appendChild(input);

        return row;
      }
    }

    const dynamicPanel = new DynamicPanel();
    app.shell.add(dynamicPanel, 'right');

    app.commands.addCommand('dynamic:open', {
      label: 'Open Dynamic CMD/DEPEND Panel',
      execute: () => {
        if (!dynamicPanel.isAttached) {
          app.shell.add(dynamicPanel, 'right');
        }
        app.shell.activateById(dynamicPanel.id);
      }
    });

    palette.addItem({ command: 'dynamic:open', category: 'Tutorial' });
  }
};

export default plugin;
