workflow "Build, Lint and Package" {
  on = "push"
  resolves = ["Package"]
}

action "Build" {
  uses = "actions/npm@master"
  args = "install"
}

action "Lint" {
  needs = ["Build"]
  uses = "actions/npm@master"
  args = "run lint"
}

action "Test" {
  needs = ["Build"]
  uses = "actions/npm@master"
  args = "test"
}

action "Package" {
  needs = ["Test", "Lint"]
  uses = "actions/npm@master"
  args = "run package"
}
