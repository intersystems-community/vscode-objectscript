// is name correlate with code ?
// if ( atelier ) {
//  testClass({ code: 'test.class.cls', file: 'class.cls' })
// } else {
//  testClass({ code: 'test.class.cls', file: 'test.class.cls' })
//}
module.exports = ({ code, file, log = data => console.log(data) }) => {
  const arr = code.split(".").filter(s => !!s); // drop empty parts

  if (arr.length < 3) {
    // without package
    log(
      `Unable to detect class.name in ${file}. Is it a valid ObjectScript class?`
    );
    return false;
  }

  // NOTE: by default, we can use package 'User'
  // else if ( parts.length === 2 ){
  // arr.unshift( 'User' ) //package by default
  // or parse 'import' directive ;)
  //}

  // is codename contain filename
  if (code.toLowerCase().includes(file.toLowerCase())) return true;
  // else
  log(`'${code}' defined in '${file}'. Rename the file or class`);
  return false;
};
