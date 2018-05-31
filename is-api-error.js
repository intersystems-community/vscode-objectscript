module.exports = ( name, action, log ) => ({ err, data = {} }) => {

    const { result, status, console } = data

    if ( err ){
        const errtext = err.code ? err.code + ' ' + err.message : err
        log( `${ name } ${ action }: ${ errtext }` )
        return true
    }

    if ( !data || !status || !( status.errors instanceof Array ) ){
        log( `Unknown response from ${ name } ${ action }: ${ JSON.stringify( res ) }` )
        return true
    }

    if ( result && result.status ){
       log( result.status )
       return true
    }

    if ( status.errors.length !== 0 ){
        log( `${ name } ${ action }:` )
        console.forEach( line => log( line ) )
        return true
    }

    return false

}
