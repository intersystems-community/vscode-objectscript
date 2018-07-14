module.exports = (name, action, log, window) => errInfo => {
  const { err, data } = errInfo;
  const { result, status, console } = data;
  let res;
  let errMsg;

  if (err) {
    const errtext = err.code ? err.code + " " + err.message : err;
    errMsg = `${name} ${action}: ${errtext}`;
    log(errMsg);
    window.showErrorMessage(errMsg);
    return true;
  }

  if (!data || !status || !(status.errors instanceof Array)) {
    errMsg = `Unknown response from ${name} ${action}: ${JSON.stringify(res)}`;
    log(errMsg);
    window.showErrorMessage(errMsg);
    return true;
  }

  if (result && result.status) {
    log(result.status);
    window.showErrorMessage(result.status);
    return true;
  }

  if (status.errors.length !== 0) {
    errMsg = `${name} ${action}:`;
    log(errMsg);
    window.showErrorMessage(errMsg);
    console.forEach(log);
    return true;
  }

  return false;
};
