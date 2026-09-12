!macro customUnInstall
  MessageBox MB_YESNOCANCEL "Do you want to preserve your Tabbin notes and settings?$\r$\n$\r$\nYes = Keep my notes and settings$\r$\nNo = Remove all Tabbin data$\r$\nCancel = Cancel uninstall" IDYES keepData IDNO removeData
  Abort
  keepData:
    Goto doneUninstall
  removeData:
    RMDir /r "$APPDATA\Tabbin"
    RMDir /r "$LOCALAPPDATA\Tabbin"
  doneUninstall:
!macroend
