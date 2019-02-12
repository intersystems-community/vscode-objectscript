workflow "Build, Lint and Package" {
  on = "push"
  resolves = ["Package", "Lint"]
}

action "Build" {
  uses = "actions/npm@master"
  args = "install"
}

action "Lint" {
  needs = "Build"
  uses = "actions/npm@master"
  args = "lint"
}

action "Package" {
  needs = "Build"
  uses = "actions/npm@master"
  args = "package"
}
