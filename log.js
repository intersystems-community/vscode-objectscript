module.exports = window => {
    if ( window && window.createOutputChannel ){
        const output = window.createOutputChannel( 'cos' )
        return msg => {
            output.appendLine( msg ) 
        }
    }
    return msg => console.log( msg )
}