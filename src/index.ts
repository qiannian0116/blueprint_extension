import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { Widget, PanelLayout } from '@lumino/widgets';
import { fileIcon } from '@jupyterlab/ui-components';
import { IFileBrowserFactory } from '@jupyterlab/filebrowser';
import JSZip from 'jszip';

import { SERVER_CONFIG } from './config';

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

        // 动态创建 ENVVAR、CMD 、DEPEND 和 CONTEXT 容器
        const envvarContainer = this.createSection('ENVVAR', 'envvar-container');
        const cmdContainer = this.createSection('CMD', 'cmd-container');
        const dependContainer = this.createSection('DEPEND', 'depend-container');
        const contextContainer = this.createSection('CONTEXT', 'context-container');

        layout.addWidget(new Widget({ node: envvarContainer }));
        layout.addWidget(new Widget({ node: cmdContainer }));
        layout.addWidget(new Widget({ node: dependContainer }));
        layout.addWidget(new Widget({ node: contextContainer }));

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

        // 获取当前路径
        let currentPath = currentWidget.model.path;

        // 获取当前路径的父目录
        const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));

        // 构造父目录中的 blueprint.json 文件路径
        const blueprintFileName = `${parentPath}/blueprint.json`;

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
      
        fetch(SERVER_CONFIG.UPLOAD_URL, {
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
        // 解析 BLUEPRINT, NAME, TYPE, VERSION, ENVIRONMENT, WORKDIR 部分
        (document.getElementById('blueprint') as HTMLInputElement).value = blueprintData['BLUEPRINT'] || '';
        (document.getElementById('name') as HTMLInputElement).value = blueprintData['NAME'] || '';
        (document.getElementById('type') as HTMLInputElement).value = blueprintData['TYPE'] || '';
        (document.getElementById('version') as HTMLInputElement).value = blueprintData['VERSION'] || '';
        (document.getElementById('environment') as HTMLInputElement).value = blueprintData['ENVIRONMENT'] || '';
        (document.getElementById('workdir') as HTMLInputElement).value = blueprintData['WORKDIR'] || '';
      
        // 解析 ENVVAR 部分
        const envvarContainer = document.getElementById('envvar-container');
        if (envvarContainer) {
          envvarContainer.innerHTML = '';  // 清空之前的内容
          blueprintData['ENVVAR'].forEach((envvar: string) => {
            const envvarRow = this.createRowWithInput(envvar);
            envvarContainer.appendChild(envvarRow);
          });
        }

        // 解析 CMD 部分
        const cmdContainer = document.getElementById('cmd-container');
        if (cmdContainer) {
          cmdContainer.innerHTML = '';  
          blueprintData['CMD'].forEach((cmd: string) => {
            const cmdRow = this.createRowWithInput(cmd);
            cmdContainer.appendChild(cmdRow);
          });
        }
      
        // 解析 DEPEND 部分
        const dependContainer = document.getElementById('depend-container');
        if (dependContainer) {
          dependContainer.innerHTML = '';  // 清空之前的内容
      
          blueprintData['DEPEND'].forEach((depend: string) => {
            // 解析类似 "[BASE] python [3.10]" 的字符串
            const regex = /^\[(PYTHON|LOCAL|PyPI|Apt|DockerHub)\]\s+(\S+)\s+\[(.*)\]$/;
            const match = depend.match(regex);
            if (match) {
              const category = match[1]; // PYTHON, LOCAL, PyPI, Apt, DockerHub
              const dependencyName = match[2]; // python, numpy, torch, etc.
              const version = match[3]; // 版本信息或路径
      
              const dependRow = this.createDependRow(category, dependencyName, version);
              dependContainer.appendChild(dependRow);
            } else {
              console.error('DEPEND format not recognized:', depend);
            }
          });
        }

        // 解析 CONTEXT 部分
        const contextContainer = document.getElementById('context-container');
        if (contextContainer) {
          contextContainer.innerHTML = '';  
          blueprintData['CONTEXT'].forEach((context: string) => {
            const contextRow = this.createRowWithInput(context);
            contextContainer.appendChild(contextRow);
          });
        }
      
        console.log('Blueprint JSON parsed and loaded into the form.');
      }
      
      // 新增 createDependRow 方法，用于创建带下拉菜单和文本框的行
      createDependRow(category: string, dependencyName: string, version: string): HTMLElement {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.marginBottom = '10px';
      
        // 创建下拉菜单
        const select = document.createElement('select');
        const options = ['PYTHON', 'LOCAL', 'PyPI', 'Apt', 'DockerHub'];
        options.forEach(option => {
          const opt = document.createElement('option');
          opt.value = option;
          opt.textContent = option;
          if (option === category) {
            opt.selected = true;  // 根据解析的值预先选择
          }
          select.appendChild(opt);
        });
        select.style.marginRight = '10px';
        select.style.width = '60px';
      
        // 创建文本框1，显示依赖项名称
        const input1 = document.createElement('input');
        input1.type = 'text';
        input1.style.flex = '1';
        input1.placeholder = '输入依赖项...';
        input1.value = dependencyName;  // 设置解析的依赖名称
        input1.style.marginRight = '10px';
        input1.style.width = '60px';
      
        // 创建文本框2，显示版本或路径
        const input2 = document.createElement('input');
        input2.type = 'text';
        input2.style.flex = '1';
        input2.placeholder = '额外信息...';
        input2.value = version;  // 设置解析的版本或路径
        input2.style.width = '60px';
      
        const removeButton = this.createRemoveButton(row);
        
        // 将各部分加入行
        row.appendChild(removeButton);
        row.appendChild(select);
        row.appendChild(input1);
        row.appendChild(input2);
      
        return row;
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
          // 根据 sectionName 确定是 ENVVAR、CMD 、 DEPEND 还是 CONTEXT
          if (sectionName === 'ENVVAR') {
            this.addRow(document.getElementById('envvar-container')!, 'ENVVAR');
          } else if (sectionName === 'CMD') {
            this.addRow(document.getElementById('cmd-container')!, 'CMD');
          } else if (sectionName === 'DEPEND') {
            this.addRow(document.getElementById('depend-container')!, 'DEPEND');
          } else if (sectionName === 'CONTEXT') {
            this.addRow(document.getElementById('context-container')!, 'CONTEXT');
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

        if (sectionName === 'DEPEND') {
          // 如果是 DEPEND 部分，生成一个下拉框和两个文本框

          // 创建下拉菜单
          const select = document.createElement('select');
          const options = ['PYTHON', 'LOCAL', 'PyPI', 'Apt', 'DockerHub'];
          options.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option;
            opt.textContent = option;
            select.appendChild(opt);
          });
          select.style.marginRight = '10px'; // 添加右边距
          select.style.width = '60px'; // 设置宽度

          // 创建文本框1
          const input1 = document.createElement('input');
          input1.type = 'text';
          input1.style.flex = '1';
          input1.placeholder = '输入依赖项...';
          input1.style.marginRight = '10px'; // 添加右边距
          input1.style.width = '60px'; // 设置宽度

          // 创建文本框2
          const input2 = document.createElement('input');
          input2.type = 'text';
          input2.style.flex = '1';
          input2.placeholder = '额外信息...';
          input2.style.width = '60px'; // 设置宽度

          const removeButton = this.createRemoveButton(row);
          
          row.appendChild(removeButton);
          row.appendChild(select);
          row.appendChild(input1);
          row.appendChild(input2);
        } else if (sectionName === 'CMD') {
          // 如果是 CMD 部分，保持原有的单个文本框布局
          const input = document.createElement('input');
          input.type = 'text';
          input.style.flex = '1';
          input.placeholder = `${sectionName} input...`;

          const removeButton = this.createRemoveButton(row);

          row.appendChild(removeButton);
          row.appendChild(input);
        } else if (sectionName === 'CONTEXT') {
          // 如果是 CONTEXT 部分，保持原有的单个文本框布局
          const input = document.createElement('input');
          input.type = 'text';
          input.style.flex = '1';
          input.placeholder = `${sectionName} input...`;

          const removeButton = this.createRemoveButton(row);

          row.appendChild(removeButton);
          row.appendChild(input);
        } else if (sectionName === 'ENVVAR') {
          // 如果是 ENVVAR 部分，保持原有的单个文本框布局
          const input = document.createElement('input');
          input.type = 'text';
          input.style.flex = '1';
          input.placeholder = `${sectionName} input...`;

          const removeButton = this.createRemoveButton(row);

          row.appendChild(removeButton);
          row.appendChild(input);
        }
        inputContainer.appendChild(row);
      
        // 添加调试信息，确认新行已添加
        console.log(`Added new ${sectionName} row`, row);
      
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
          ENVVAR: Array.from(document.querySelectorAll('#envvar-container input')).map(
            input => (input as HTMLInputElement).value
          ),
          CMD: Array.from(document.querySelectorAll('#cmd-container input')).map(
            input => (input as HTMLInputElement).value
          ),
          DEPEND: Array.from(document.querySelectorAll('#depend-container > div')).map(row => {
            const select = row.querySelector('select') as HTMLSelectElement;
            const input1 = row.querySelectorAll('input')[0] as HTMLInputElement; // 依赖项名称
            const input2 = row.querySelectorAll('input')[1] as HTMLInputElement; // 版本或路径信息
      
            // 生成类似 "[BASE] python [3.10]" 的格式
            return `[${select.value}] ${input1.value} [${input2.value}]`;
          }),
          CONTEXT: Array.from(document.querySelectorAll('#context-container input')).map(
            input => (input as HTMLInputElement).value
          )
        };
      
        console.log('Captured ENVVAR values:', blueprintData.ENVVAR);
        console.log('Captured CMD values:', blueprintData.CMD);
        console.log('Captured DEPEND values:', blueprintData.DEPEND);
        console.log('Captured CONTEXT values:', blueprintData.CONTEXT);
      
        const currentWidget = fileBrowserFactory.tracker.currentWidget;
      
        if (!currentWidget) {
          console.error('No file browser widget is currently open or focused.');
          return;
        }
            
        // 获取当前路径
        let currentPath = currentWidget.model.path;

        // 获取当前路径的父目录
        const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));

        // 构造父目录中的 blueprint.json 文件路径
        const blueprintFileName = `${parentPath}/blueprint.json`;

        const documentManager = currentWidget.model.manager;
      
        // 生成 JSON 文件
        const jsonData = JSON.stringify(blueprintData, null, 2);
      
        // 将 JSON 数据发送到服务器
        const formData = new FormData();
        formData.append('file', new Blob([jsonData], { type: 'application/json' }), 'blueprint.json');
      
        fetch(SERVER_CONFIG.BLUEPRINT_URL, {
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
      label: 'Open Dynamic ENVVAR/CMD/DEPEND/CONTEXT Panel',
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
