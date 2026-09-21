!ifndef OPAC_MODE
  !error "OPAC_MODE must be defined before including installer-mode.nsh"
!endif

!macro customInstall
  CreateDirectory "$%PROGRAMDATA%\OpacLibrarySystem"
  FileOpen $0 "$%PROGRAMDATA%\OpacLibrarySystem\install.json" w
  FileWrite $0 '{"mode":"${OPAC_MODE}","installedVersion":"${VERSION}"}'
  FileClose $0
  CreateDirectory "$APPDATA\opac-library-system"
  FileOpen $0 "$APPDATA\opac-library-system\install.json" w
  FileWrite $0 '{"mode":"${OPAC_MODE}","installedVersion":"${VERSION}"}'
  FileClose $0
!macroend

!macro customUnInstall
  Delete "$%PROGRAMDATA%\OpacLibrarySystem\install.json"
!macroend