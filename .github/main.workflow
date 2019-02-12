workflow "Build, Lint and Package" {
  on = "push"
  resolves = ["Package"]
}

action "Build" {
  uses = "actions/npm@master"
  args = "install"
}

action "Lint" {
  needs = "Build"
  uses = "actions/npm@master"
  args = "run lint"
}

action "Test" {
  needs = "Build"
  uses = "actions/npm@master"
  args = "run test"
}

action "Package" {
  needs = "Test"
  uses = "actions/npm@master"
  args = "run package"
}
