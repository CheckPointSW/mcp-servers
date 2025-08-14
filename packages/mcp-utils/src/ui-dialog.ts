import { createServer, Server } from 'http';
import { URL } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface DialogField {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'email' | 'password' | 'select';
  placeholder?: string;
  required?: boolean;
  options?: string[]; // For select fields
  defaultValue?: string;
}

export interface DialogConfig {
  title: string;
  message?: string;
  fields: DialogField[];
  submitButtonText?: string;
  cancelButtonText?: string;
}

export interface DialogResult {
  cancelled: boolean;
  data: Record<string, string>;
}

class UIDialog {
  private server: Server | null = null;
  private port: number = 0;
  private resolve: ((result: DialogResult) => void) | null = null;

  async showDialog(config: DialogConfig): Promise<DialogResult> {
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      
      // Find available port
      this.server = createServer((req, res) => {
        this.handleRequest(req, res, config);
      });

      this.server.listen(0, 'localhost', () => {
        const address = this.server!.address();
        if (address && typeof address === 'object') {
          this.port = address.port;
          this.openBrowser(`http://localhost:${this.port}`);
        } else {
          reject(new Error('Failed to start server'));
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        this.cleanup();
        resolve({ cancelled: true, data: {} });
      }, 5 * 60 * 1000);
    });
  }

  private handleRequest(req: any, res: any, config: DialogConfig) {
    const url = new URL(req.url!, `http://localhost:${this.port}`);
    
    if (req.method === 'GET' && url.pathname === '/') {
      // Serve the dialog HTML
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(this.generateHTML(config));
    } else if (req.method === 'POST' && url.pathname === '/submit') {
      // Handle form submission
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        const formData = new URLSearchParams(body);
        const result: Record<string, string> = {};
        
        for (const field of config.fields) {
          result[field.name] = formData.get(field.name) || '';
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head><title>Success</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h2>Form submitted successfully!</h2>
              <p>You can close this window now.</p>
              <script>setTimeout(() => window.close(), 2000);</script>
            </body>
          </html>
        `);

        this.cleanup();
        if (this.resolve) {
          this.resolve({ cancelled: false, data: result });
        }
      });
    } else if (req.method === 'POST' && url.pathname === '/cancel') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>Cancelled</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2>Form cancelled</h2>
            <p>You can close this window now.</p>
            <script>setTimeout(() => window.close(), 2000);</script>
          </body>
        </html>
      `);

      this.cleanup();
      if (this.resolve) {
        this.resolve({ cancelled: true, data: {} });
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }

  private generateHTML(config: DialogConfig): string {
    const fieldsHTML = config.fields.map(field => {
      let fieldHTML = '';
      const fieldType = field.type || 'text'; // Default to 'text' if not specified
      
      switch (fieldType) {
        case 'textarea':
          fieldHTML = `
            <textarea 
              name="${field.name}" 
              placeholder="${field.placeholder || ''}"
              ${field.required ? 'required' : ''}
              style="width: 100%; box-sizing: border-box; min-height: 80px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: Arial, sans-serif; font-size: 14px; resize: vertical;"
            >${field.defaultValue || ''}</textarea>
          `;
          break;
        
        case 'select':
          fieldHTML = `
            <select 
              name="${field.name}" 
              ${field.required ? 'required' : ''}
              style="width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: Arial, sans-serif; font-size: 14px;"
            >
              <option value="">Select an option...</option>
              ${(field.options || []).map(option => 
                `<option value="${option}" ${option === field.defaultValue ? 'selected' : ''}>${option}</option>`
              ).join('')}
            </select>
          `;
          break;
        
        default:
          fieldHTML = `
            <input 
              type="${fieldType}" 
              name="${field.name}" 
              placeholder="${field.placeholder || ''}"
              value="${field.defaultValue || ''}"
              ${field.required ? 'required' : ''}
              style="width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: Arial, sans-serif; font-size: 14px;"
            />
          `;
      }

      return `
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">
            ${field.label}${field.required ? ' *' : ''}
          </label>
          ${fieldHTML}
        </div>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${config.title}</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            * {
              box-sizing: border-box;
            }
            body {
              font-family: Arial, sans-serif;
              max-width: 500px;
              margin: 50px auto;
              padding: 20px;
              background-color: #f5f5f5;
              line-height: 1.4;
            }
            .dialog {
              background: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .buttons {
              margin-top: 20px;
              text-align: right;
            }
            button {
              padding: 10px 20px;
              margin-left: 10px;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
              font-family: Arial, sans-serif;
            }
            .submit-btn {
              background-color: #007cba;
              color: white;
            }
            .submit-btn:hover {
              background-color: #005a87;
            }
            .cancel-btn {
              background-color: #6c757d;
              color: white;
            }
            .cancel-btn:hover {
              background-color: #545b62;
            }
            input:focus, textarea:focus, select:focus {
              outline: none;
              border-color: #007cba;
              box-shadow: 0 0 0 2px rgba(0, 124, 186, 0.2);
            }
          </style>
        </head>
        <body>
          <div class="dialog">
            <h2 style="margin-top: 0; color: #333;">${config.title}</h2>
            ${config.message ? `<p style="color: #666; margin-bottom: 20px;">${config.message}</p>` : ''}
            
            <form id="dialogForm" method="POST" action="/submit">
              ${fieldsHTML}
              
              <div class="buttons">
                <button type="button" class="cancel-btn" onclick="cancel()">
                  ${config.cancelButtonText || 'Cancel'}
                </button>
                <button type="submit" class="submit-btn">
                  ${config.submitButtonText || 'Submit'}
                </button>
              </div>
            </form>
          </div>

          <script>
            function cancel() {
              fetch('/cancel', { method: 'POST' })
                .then(() => {
                  document.body.innerHTML = '<div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;"><h2>Cancelled</h2><p>You can close this window now.</p></div>';
                  setTimeout(() => window.close(), 2000);
                });
            }

            // Auto-focus first input
            document.addEventListener('DOMContentLoaded', () => {
              const firstInput = document.querySelector('input, textarea, select');
              if (firstInput) {
                firstInput.focus();
                // If it's a text input, place cursor at end
                if (firstInput.type === 'text' || firstInput.tagName === 'TEXTAREA') {
                  const val = firstInput.value;
                  firstInput.value = '';
                  firstInput.value = val;
                }
              }
            });

            // Prevent form submission if required fields are empty
            document.getElementById('dialogForm').addEventListener('submit', function(e) {
              const requiredFields = document.querySelectorAll('[required]');
              for (let field of requiredFields) {
                if (!field.value.trim()) {
                  e.preventDefault();
                  field.focus();
                  alert('Please fill in all required fields.');
                  return false;
                }
              }
            });
          </script>
        </body>
      </html>
    `;
  }

  private async openBrowser(urlString: string) {
    try {
      // Validate URL to ensure it's properly formatted and uses a safe protocol
      let url: URL;
      try {
        url = new URL(urlString);

        // Only allow http/https protocols and only localhost for security
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1')
        ) {
          throw new Error('Invalid URL protocol or non-localhost hostname');
        }
      } catch (e) {
        console.error('Invalid URL:', e);
        return;
      }

      // Platform-specific browser opening with safer approaches
      switch (process.platform) {
        case 'darwin': { // macOS
          // Create a temporary AppleScript file for opening the browser
          const scriptPath = path.join(process.env.TMPDIR || '/tmp', `open-browser-${Date.now()}.applescript`);
          const script = `open location "${urlString}"`;

          fs.writeFileSync(scriptPath, script);
          await execAsync(`osascript "${scriptPath}"`);

          // Clean up the temp file
          try {
            fs.unlinkSync(scriptPath);
          } catch (e) {
            // Ignore cleanup errors
          }
          break;
        }
        case 'win32': { // Windows
          // Use rundll32 for a safer approach on Windows
          await execAsync(`rundll32 url.dll,FileProtocolHandler "${urlString}"`);
          break;
        }
        default: { // Linux and others
          // On Linux, try various browser openers in sequence
          const browsers = ['xdg-open', 'google-chrome', 'firefox', 'chromium-browser'];

          for (const browser of browsers) {
            try {
              await execAsync(`which ${browser}`);
              await execAsync(`${browser} "${urlString}"`);
              break;
            } catch {
              continue;
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to open browser:', error);
    }
  }

  private cleanup() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

/**
 * Shows a native UI dialog with custom fields and returns the user input
 * @param config Dialog configuration including title, message, and fields
 * @returns Promise that resolves with the dialog result containing user input or cancellation status
 */
export async function showDialog(config: DialogConfig): Promise<DialogResult> {
  const dialog = new UIDialog();
  return dialog.showDialog(config);
}

/**
 * Shows a simple dialog with predefined fields: address, user, password
 * @param title Optional title for the dialog (defaults to "Login Information")
 * @param message Optional message to display
 * @returns Promise that resolves with the dialog result containing address, user, and password fields
 */
export async function showLoginDialog(title?: string, message?: string): Promise<DialogResult> {
  return showDialog({
    title: title || "Login Information",
    message: message,
    fields: [
      {
        name: "address",
        label: "Address",
        type: "text",
        placeholder: "Enter server address...",
        required: true
      },
      {
        name: "user",
        label: "Username",
        type: "text",
        placeholder: "Enter username...",
        required: true
      },
      {
        name: "password",
        label: "Password",
        type: "password",
        placeholder: "Enter password...",
        required: true
      }
    ]
  });
}
