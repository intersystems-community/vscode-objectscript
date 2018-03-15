const vscode = require('vscode')
const { workspace, window } = vscode
const API = require('cos-api4node') 
const LOG = require( './log' )
const languages = require('./package.json')[ 'contributes' ][ 'languages' ].map( lang => lang.id )
const panel = require( './status-bar-panel' )
const CmdExport = require( './commands/export' )
const CmdCompile = require( './commands/compile' )

const activate = context => {

    const log = LOG( window )
    const options = workspace.getConfiguration( 'cos' )
    const conn = options.get( 'conn' )
    conn.toString = function(){
        return JSON.stringify( 
            Object.assign( {}, conn, {
                password: "***" //hide passw 
            }),
            null, //replacer
            4 //space
        )
    }

    const api = API( conn )

    api.headServer( err => {

        if ( !!err ) return log( 'Connection FAILED: ' + conn )
        log( 'Connected ' + conn )
        panel.set( conn )

    })

    const exportTo = options.get( 'export' )
    exportTo.root = workspace.rootPath

    const cosExport = CmdExport({ api, log, options: exportTo })
    const cosCompile = CmdCompile({ window, api, log, languages })

    context.subscriptions.push(
        vscode.commands.registerCommand( 'cos.export', cosExport )
        , vscode.commands.registerCommand( 'cos.compile', cosCompile )
    )

}

module.exports = { activate, deactivate: () => {} }