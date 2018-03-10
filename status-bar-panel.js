const vscode = require('vscode')
const panel = vscode.window.createStatusBarItem( 
    vscode.StatusBarAlignment.Left
)
panel.show()
const set = conn => { panel.text = `${conn.label}:${conn.ns}` }
module.exports = { set }