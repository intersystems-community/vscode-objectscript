// is name correlate with code ?
// if ( atelier_way ) {
//  testClass({ code: 'test.rtn.mac', file: 'rtn.mac' })
// } else {
//  testClass({ codename: 'test.rtn.mac', file: 'test.rtn.mac' })
//}
module.exports = ({ code, file, log }) => {

    if ( !code ){

        log(

`Unable to detect routine name in source code of ${ file }.
Routine code example:

ROUTINE RtnName [Type=MAC]
  w "routine code here"
  Quit
`
        )
        return false

    }
 
    if ( !~code.toLowerCase().indexOf( file.toLowerCase() ) ) {

        log(
`You tried to compile '${ code }' in file '${ file }' 
Rename the file or routine to correspond to each other.
Routine code example: 

ROUTINE RtnName [Type=MAC]
 write "routine code here"
 Quit`
        )
        return false

    }

    return true

}
