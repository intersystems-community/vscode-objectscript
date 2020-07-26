---
layout: default
title: Code Formatting
permalink: /code-formatting/
nav_order: 3
---
# Code formatting

In previous versions of the objectscript plugin, VSCode code completion suggested commands and functions only in UPPERCASE. Now you can select the capitalization style you prefer. There are three options:
* upper - all uppercase
* lower - all lower case
* word - capitalize initial letter of each word

```json
"objectscript.format": {
  "commandCase": "word",
  "functionCase": "word"
},
```

You can see how it works below.

![](https://community.intersystems.com/sites/default/files/inline/images/images/ezgif_com-optimize.gif)

VSCode itself has formatting support using Meta/Alt+Shift+F, and it can format code using configured rules. Currently, it can replace abbreviated commands and functions with the complete name, control capitalization as above, and fix indentation by substituting tabs for spaces.

![](https://community.intersystems.com/sites/default/files/inline/images/images/ezgif_com-optimize%20(1).gif)