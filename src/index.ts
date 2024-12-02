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
            envvarContainer.innerHTML = ''; // 清空之前的内容
            blueprintData['ENVVAR'].forEach((envvar: string) => {
                const [key, value] = envvar.split('=');
                const envvarRow = this.createEnvVarRow(key || '', value || '');
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
          dependContainer.innerHTML = ''; // 清空之前的内容
          blueprintData['DEPEND'].forEach((depend: string) => {
              // 根据前缀 `-` 或 `|` 判断行类型
              const isFiveFieldRow = depend.startsWith('|');
              const cleanedDepend = depend.slice(2).trim(); // 去掉前缀
              const regex = /^\[(PYTHON|LOCAL|PyPI|Apt|DockerHub)\]\s+(\S+)\s+\[(.*)\](?:\s+\{([^{}]*)\})?(?:\s+\{([^{}]*)\})?$/;
              const match = cleanedDepend.match(regex);
              if (match) {
                  const category = match[1]; // PYTHON, LOCAL, PyPI, Apt, DockerHub
                  const dependencyName = match[2]; // 依赖名称
                  const version = match[3]; // 版本或路径信息
                  const condition1 = match[4] || ''; // 第一个条件内容（无括号）
                  const condition2 = match[5] || ''; // 第二个条件内容（无括号）
      
                  if (isFiveFieldRow) {
                      // 五字段行
                      const dependRow = this.createAdditionalDependRow(category, dependencyName, version, condition1, condition2);
                      dependContainer.appendChild(dependRow);
                  } else {
                      // 三字段行
                      const dependRow = this.createDependRow(category, dependencyName, version);
                      dependContainer.appendChild(dependRow);
                  }
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
    
        // 创建行前缀 `-`
        const prefix = document.createElement('span');
        prefix.textContent = '-';
        prefix.style.marginRight = '10px';
        prefix.style.fontWeight = 'bold';
    
        // 创建下拉菜单
        const select = document.createElement('select');
        const options = ['PYTHON', 'LOCAL', 'PyPI', 'Apt', 'DockerHub'];
        options.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option;
            opt.textContent = option;
            if (option === category) {
                opt.selected = true; // 根据解析值预先选择
            }
            select.appendChild(opt);
        });
        select.style.marginRight = '10px';
        select.style.width = '60px';
    
        // 创建第一个文本框
        const input1 = document.createElement('input');
        input1.type = 'text';
        input1.style.flex = '1';
        input1.placeholder = 'Dependency input...';
        input1.value = dependencyName;
        input1.style.marginRight = '10px';
    
        // 创建第二个文本框
        const input2 = document.createElement('input');
        input2.type = 'text';
        input2.style.flex = '1';
        input2.placeholder = 'Version input...';
        input2.value = version;
        input2.style.marginRight = '10px';
    
        // 创建加号按钮，用于生成五字段行
        const addButton = document.createElement('button');
        addButton.textContent = '+';
        addButton.style.marginRight = '10px';
        addButton.classList.add('jp-AddButton');
        addButton.onclick = () => {
            // 点击加号按钮后生成一行五字段
            const newRow = this.createAdditionalDependRow(category, '', '', '', '');
            row.parentElement?.insertBefore(newRow, row.nextSibling);
        };
    
        // 创建移除按钮
        const removeButton = this.createRemoveButton(row);
    
        // 将所有元素添加到行中
        row.appendChild(removeButton);
        row.appendChild(prefix);
        row.appendChild(select);
        row.appendChild(input1);
        row.appendChild(input2);
        row.appendChild(addButton);
    
        return row;
      }    
    
    // 创建新行的方法，包含五个文本框
    createAdditionalDependRow(category: string, dependencyName: string, version: string, extraField1: string, extraField2: string): HTMLElement {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.marginBottom = '10px';
  
      // 创建行前缀 `|`
      const prefix = document.createElement('span');
      prefix.textContent = '|';
      prefix.style.marginRight = '10px';
      prefix.style.fontWeight = 'bold';
  
      // 创建前三个字段
      const select = document.createElement('select');
      const options = ['PYTHON', 'LOCAL', 'PyPi', 'Apt', 'DockerHub'];
      options.forEach(option => {
          const opt = document.createElement('option');
          opt.value = option;
          opt.textContent = option;
          if (option === category) {
              opt.selected = true;
          }
          select.appendChild(opt);
      });
      select.style.marginRight = '10px';
      select.style.width = '60px';
  
      const input1 = document.createElement('input');
      input1.type = 'text';
      input1.style.flex = '1';
      input1.placeholder = 'Dependency input...';
      input1.value = dependencyName;
      input1.style.marginRight = '10px';
  
      const input2 = document.createElement('input');
      input2.type = 'text';
      input2.style.flex = '1';
      input2.placeholder = 'Version input...';
      input2.value = version;
      input2.style.marginRight = '10px';
  
      // 创建第四字段
      const input3 = document.createElement('input');
      input3.type = 'text';
      input3.style.flex = '1';
      input3.placeholder = 'Alternative input...';
      input3.value = extraField1;
      input3.style.marginRight = '10px';
  
      // 创建第五字段
      const input4 = document.createElement('input');
      input4.type = 'text';
      input4.style.flex = '1';
      input4.placeholder = 'Deployability input...';
      input4.value = extraField2;
  
      // 创建移除按钮
      const removeButton = this.createRemoveButton(row);
  
      // 将所有元素添加到行中
      row.appendChild(removeButton);
      row.appendChild(prefix);
      row.appendChild(select);
      row.appendChild(input1);
      row.appendChild(input2);
      row.appendChild(input3);
      row.appendChild(input4);
  
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
          { label: 'WORKDIR', placeholder: 'Workdir input...' },
          { label: 'DEPLOYABILITY', placeholder: 'Deployability input...' }
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
            // 创建行前缀 `-`
            const prefix = document.createElement('span');
            prefix.textContent = '-';
            prefix.style.marginRight = '10px';
            prefix.style.fontWeight = 'bold';

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
            input1.placeholder = 'Dependency input...';
            input1.style.marginRight = '10px'; // 添加右边距
            input1.style.width = '60px'; // 设置宽度
    
            // 创建文本框2
            const input2 = document.createElement('input');
            input2.type = 'text';
            input2.style.flex = '1';
            input2.placeholder = 'Version input...';
            input2.style.marginRight = '10px'; // 添加右边距
            input2.style.width = '60px'; // 设置宽度
    
            // 创建加号按钮
            const addButton = document.createElement('button');
            addButton.textContent = '+';
            addButton.classList.add('jp-AddButton');
            addButton.style.marginRight = '10px';
            addButton.onclick = () => {
                // 在当前行下面插入一个新行
                const newRow = this.createAdditionalDependRow('', '', '', '', '');
                row.parentElement?.insertBefore(newRow, row.nextSibling);
            };
    
            // 创建移除按钮
            const removeButton = this.createRemoveButton(row);
    
            // 将各部分加入行
            row.appendChild(removeButton);
            row.appendChild(prefix);
            row.appendChild(select);
            row.appendChild(input1);
            row.appendChild(input2);
            row.appendChild(addButton);
        } else if (sectionName === 'CMD' || sectionName === 'CONTEXT') {
            // 原有逻辑保持不变
            const input = document.createElement('input');
            input.type = 'text';
            input.style.flex = '1';
            input.placeholder = `${sectionName} input...`;
    
            const removeButton = this.createRemoveButton(row);
    
            row.appendChild(removeButton);
            row.appendChild(input);
        } else if (sectionName === 'ENVVAR') {
            // ENVVAR逻辑
            const envvarRow = this.createEnvVarRow();
            row.appendChild(envvarRow);
        }
        inputContainer.appendChild(row);
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
          DEPLOYABILITY: (document.getElementById('deployability') as HTMLInputElement).value,
          ENVVAR: Array.from(document.querySelectorAll('#envvar-container > div')).map(row => {
            const inputs = row.querySelectorAll('input');
            const key = (inputs[0] as HTMLInputElement).value;
            const value = (inputs[1] as HTMLInputElement).value;
            return `${key}=${value}`;
          }),          
          CMD: Array.from(document.querySelectorAll('#cmd-container input')).map(
            input => (input as HTMLInputElement).value
          ),
          DEPEND: Array.from(document.querySelectorAll('#depend-container > div')).map(row => {
            const select = row.querySelector('select') as HTMLSelectElement;
            const input1 = row.querySelectorAll('input')[0] as HTMLInputElement; // 依赖项名称
            const input2 = row.querySelectorAll('input')[1] as HTMLInputElement; // 版本或路径信息
            const input3 = row.querySelectorAll('input')[2] as HTMLInputElement; // 第一个条件（仅五字段行有）
            const input4 = row.querySelectorAll('input')[3] as HTMLInputElement; // 第二个条件（仅五字段行有）
        
            // 判断是否是五字段行
            const isFiveFieldRow = row.querySelectorAll('input').length === 4;
        
            if (isFiveFieldRow) {
                // 五字段行：生成格式 "| [CATEGORY] dependency [version] {condition1} {condition2}"
                return `| [${select.value}] ${input1.value} [${input2.value}] {${input3.value}} {${input4.value}}`;
            } else {
                // 三字段行：生成格式 "- [CATEGORY] dependency [version]"
                return `- [${select.value}] ${input1.value} [${input2.value}]`;
            }
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

      createEnvVarRow(key: string = '', value: string = ''): HTMLElement {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.marginBottom = '10px';
      
        // 创建第一个输入框（变量名）
        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.style.flex = '1';
        keyInput.placeholder = '变量名';
        keyInput.value = key;
        keyInput.style.marginRight = '5px'; // 添加右边距
      
        // 创建静态的等号标签
        const equalsLabel = document.createElement('span');
        equalsLabel.textContent = '=';
        equalsLabel.style.margin = '0 5px'; // 添加左右边距
      
        // 创建第二个输入框（变量值）
        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.style.flex = '1';
        valueInput.placeholder = '变量值';
        valueInput.value = value;
      
        // 创建移除按钮
        const removeButton = this.createRemoveButton(row);
      
        // 将各个部分添加到行中
        row.appendChild(removeButton);
        row.appendChild(keyInput);
        row.appendChild(equalsLabel); // 添加等号
        row.appendChild(valueInput);
      
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
