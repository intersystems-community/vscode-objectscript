// Caché class files can be placed hierarchically (e.g. /src/Package/Class.cls),
// so we pick the class name from the class definition itself
const pattern = /Class ([^\s]+)/i; //'Class test.class'

module.exports = code => {
  const arr = code.match(pattern) || []; // ['Class test.class', 'test.class']
  const name = arr[1] || "",
    ext = "cls";
  return { name, ext }; // test.class.cls
};
