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

        const cmdContainer = this.createSection('CMD');
        const dependContainer = this.createSection('DEPEND');

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
          await this.zipCurrentDirectory(); // 打包当前目录的文件
        };

        const parseLocalFileButton = document.createElement('button');
        parseLocalFileButton.textContent = '解析本地蓝图文件';
        parseLocalFileButton.onclick = () => {
          console.log('解析本地蓝图文件按钮被点击');
        };

        buttonRow.appendChild(parseCodeButton);
        buttonRow.appendChild(parseLocalFileButton);

        return buttonRow;
      }

      async zipCurrentDirectory(): Promise<void> {
        const currentWidget = fileBrowserFactory.tracker.currentWidget;
      
        // 检查 currentWidget 是否为 null
        if (!currentWidget) {
          console.error('No file browser widget is currently open or focused.');
          return;
        }
      
        // 获取当前路径
        const currentPath = currentWidget.model.path;
      
        // 获取 document manager 服务
        const documentManager = currentWidget.model.manager;
      
        // 使用 services.contents 获取目录下的文件
        const fileItems = await documentManager.services.contents.get(currentPath);
      
        const zip = new JSZip();
        const folder = zip.folder("test")!;
      
        for (const item of fileItems.content) {
          if (item.type === 'file') {
            // 获取文件内容
            const fileContent = await documentManager.services.contents.get(item.path, { content: true });
            folder.file(item.name, fileContent.content, { base64: true });
          }
        }
      
        const zipContent = await zip.generateAsync({ type: "base64" }); // 生成Base64内容字符串
        const zipFileName = 'test.zip';
      
        // 保存压缩文件到当前目录
        await documentManager.services.contents.save(`${currentPath}/${zipFileName}`, {
          type: 'file',
          format: 'base64',
          content: zipContent  // 这是正确的Base64编码字符串
        });
      
        console.log(`${zipFileName} 文件已生成`);
      
        // 创建 FormData 并附加 zip 文件
        const formData = new FormData();
        formData.append('file', new Blob([zipContent], { type: 'application/zip' }), zipFileName);
      
        // 发送请求到后端
        fetch('http://172.16.32.12:8080/upload', {
          method: 'POST',
          body: formData
        })
        .then(response => response.json())  // 假设后端返回 JSON 数据
        .then(async data => {
          console.log('Blueprint JSON received:', data);
      
          // 将返回的 blueprint.json 保存到当前目录下
          const blueprintFileName = 'blueprint.json';
          await documentManager.services.contents.save(`${currentPath}/${blueprintFileName}`, {
            type: 'file',
            format: 'text',
            content: JSON.stringify(data, null, 2)  // 将 JSON 转换为字符串并保存
          });
      
          console.log('blueprint.json 文件已保存到当前目录');
        })
        .catch(error => {
          console.error('Error uploading file or receiving blueprint.json:', error);
        });
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

          fieldRow.appendChild(label);
          fieldRow.appendChild(input);
          formContainer.appendChild(fieldRow);
        });

        formContainer.style.marginBottom = '20px';
        return formContainer;
      }

      createSection(sectionName: string): HTMLElement {
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
        container.appendChild(inputContainer);

        this.addRow(inputContainer, sectionName);

        return container;
      }

      createAddButton(inputContainer: HTMLElement, sectionName: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.textContent = '+';
        button.classList.add('jp-AddButton');
        button.style.marginLeft = '10px';
        button.onclick = () => {
          this.addRow(inputContainer, sectionName);
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
      }

      createConfirmButton(): HTMLElement {
        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '20px';
        buttonContainer.style.textAlign = 'center';

        const confirmButton = document.createElement('button');
        confirmButton.textContent = '确认蓝图';
        confirmButton.style.padding = '10px 20px';
        confirmButton.onclick = () => {
          console.log('确认蓝图按钮被点击');
        };

        buttonContainer.appendChild(confirmButton);
        return buttonContainer;
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
