!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!macro customPageAfterChangeDir
  Var OpacModeDlg
  Var OpacModeLabel
  Var OpacModeRadioAdmin
  Var OpacModeRadioUser
  Var OpacModeChoice

  Function OpacModePageCreate
    ${IfNot} ${Silent}
      nsDialogs::Create 1018
      Pop $OpacModeDlg

      ${If} $OpacModeDlg == error
        Abort
      ${EndIf}

      ${NSD_CreateLabel} 0 0 100% 20u "Choose how this computer will use OPAC Library System:"
      Pop $OpacModeLabel

      ${NSD_CreateRadioButton} 0 34u 100% 20u "Admin - Library Server"
      Pop $OpacModeRadioAdmin

      ${NSD_CreateLabel} 12 54u 100% 24u "Hosts the library database and catalog server.$\r$\nOther computers on your network connect to this one. (Recommended for the main library computer)"
      Pop $OpacModeLabel

      ${NSD_CreateRadioButton} 0 86u 100% 20u "User - Catalog Client"
      Pop $OpacModeRadioUser

      ${NSD_CreateLabel} 12 106u 100% 24u "Browses the library catalog from another computer.$\r$\nRequires the server address and access token from the library administrator."
      Pop $OpacModeLabel

      ${If} $OpacModeChoice == ""
        StrCpy $OpacModeChoice "admin"
      ${EndIf}

      ${If} $OpacModeChoice == "admin"
        ${NSD_Check} $OpacModeRadioAdmin
      ${Else}
        ${NSD_Check} $OpacModeRadioUser
      ${EndIf}

      ${NSD_OnClick} $OpacModeRadioAdmin OpacModeAdminClicked
      ${NSD_OnClick} $OpacModeRadioUser OpacModeUserClicked
    ${EndIf}
  FunctionEnd

  Function OpacModeAdminClicked
    StrCpy $OpacModeChoice "admin"
  FunctionEnd

  Function OpacModeUserClicked
    StrCpy $OpacModeChoice "user"
  FunctionEnd

  Function OpacModePageLeave
    ${NSD_GetState} $OpacModeRadioAdmin $0
    ${If} $0 == 1
      StrCpy $OpacModeChoice "admin"
    ${Else}
      StrCpy $OpacModeChoice "user"
    ${EndIf}
  FunctionEnd

  Page custom OpacModePageCreate OpacModePageLeave
!macroend

!macro customInstall
  StrCmp $OpacModeChoice "" 0 +2
    StrCpy $OpacModeChoice "admin"
  CreateDirectory "$%PROGRAMDATA%\OpacLibrarySystem"
  FileOpen $0 "$%PROGRAMDATA%\OpacLibrarySystem\install.json" w
  FileWrite $0 '{"mode":"$OpacModeChoice","installedVersion":"${VERSION}"}'
  FileClose $0
  CreateDirectory "$APPDATA\opac-library-system"
  FileOpen $0 "$APPDATA\opac-library-system\install.json" w
  FileWrite $0 '{"mode":"$OpacModeChoice","installedVersion":"${VERSION}"}'
  FileClose $0
!macroend

!macro customUnInstall
  Delete "$%PROGRAMDATA%\OpacLibrarySystem\install.json"
!macroend