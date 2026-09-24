Unicode true
RequestExecutionLevel user
SetCompressor /SOLID lzma
!include "${GENERATED_CONFIG}"
!define MUI_ICON "${PRODUCT_ICON}"
!define MUI_UNICON "${PRODUCT_ICON}"
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "${__FILEDIR__}\autostart.nsh"
!include "FileFunc.nsh"
!include "WordFunc.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
!include "nsDialogs.nsh"

Name "Lumeria"
BrandingText "Lumeria"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\Lumeria"
InstallDirRegKey HKCU "Software\com.lumeria.app" "InstallLocation"
VIProductVersion "${PRODUCT_VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Lumeria"
VIAddVersionKey /LANG=1033 "FileDescription" "Lumeria Setup"
VIAddVersionKey /LANG=1033 "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Lumeria"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\Lumeria.exe"
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
UninstPage custom un.DataPage un.DataPageLeave
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "SimpChinese"

LangString UnsafeDirectory ${LANG_ENGLISH} "Choose an empty folder for Lumeria, or its existing installation folder. System folders, data folders and directory links cannot be used."
LangString UnsafeDirectory ${LANG_SIMPCHINESE} "请选择空文件夹或 Lumeria 原安装目录。不能使用系统目录、数据目录或目录链接。"
LangString KeepDirectory ${LANG_ENGLISH} "Please upgrade in the existing installation folder. To move Lumeria, uninstall it first and keep your application data."
LangString KeepDirectory ${LANG_SIMPCHINESE} "升级请使用原安装目录。如需迁移，请先卸载并保留应用数据。"
LangString CloseFailed ${LANG_ENGLISH} "Lumeria could not save and exit. Resolve the issue in Lumeria, then try again. No installed files were replaced."
LangString CloseFailed ${LANG_SIMPCHINESE} "Lumeria 未能保存并退出。请在应用中处理后重试，已安装的文件尚未被替换。"
LangString InstallFailed ${LANG_ENGLISH} "Installation failed. The previous installation has been restored when possible. Check the details below before retrying."
LangString InstallFailed ${LANG_SIMPCHINESE} "安装失败，已尽可能恢复原安装。请查看下方详细信息后重试。"
LangString OlderVersion ${LANG_ENGLISH} "A newer version of Lumeria is installed. This installer cannot downgrade it."
LangString OlderVersion ${LANG_SIMPCHINESE} "已安装更新版本的 Lumeria，不能使用此安装包降级。"
LangString PurgeTitle ${LANG_ENGLISH} "Application data"
LangString PurgeTitle ${LANG_SIMPCHINESE} "应用数据"
LangString PurgeDescription ${LANG_ENGLISH} "Your settings, layout, icons and backgrounds are kept by default."
LangString PurgeDescription ${LANG_SIMPCHINESE} "默认保留设置、布局、图标和背景。"
LangString PurgeChoice ${LANG_ENGLISH} "Also permanently delete my Lumeria application data"
LangString PurgeChoice ${LANG_SIMPCHINESE} "同时永久删除我的 Lumeria 应用数据"
LangString CleanupFailed ${LANG_ENGLISH} "Some files could not be removed. They have been preserved; see the details below."
LangString CleanupFailed ${LANG_SIMPCHINESE} "部分文件未能清理，已予以保留。请查看下方详细信息。"
LangString Busy ${LANG_ENGLISH} "Another Lumeria installer is running. Close it and try again."
LangString Busy ${LANG_SIMPCHINESE} "另一个 Lumeria 安装程序正在运行，请关闭后重试。"
LangString LegacyPreview ${LANG_ENGLISH} "An Electrobun preview named LaunchPad Native is still installed. Uninstall that preview from Windows Installed apps, keeping its data, then run this installer again. Your data in %APPDATA%\com.lumeria.app is retained."
LangString LegacyPreview ${LANG_SIMPCHINESE} "检测到旧的 LaunchPad Native 预览版。请先在 Windows“已安装的应用”中卸载旧版并保留数据，再运行本安装包。%APPDATA%\com.lumeria.app 中的业务数据会保留。"

Var Incoming
Var Backup
Var HasPrevious
Var Committed
Var RegisteredDirectory
Var InstallVersion
Var InstallSize
Var UpgradeCleanup
Var PurgeData
Var DataCheckbox
Var DataDirectory
Var ScanDirectory
Var InstallerMutex
Var Result
Var LogFile
Var LogHandle

!macro Trace TEXT
  DetailPrint "${TEXT}"
  FileWriteUTF16LE $LogHandle "${TEXT}$\r$\n"
!macroend

!macro OpenLog KIND
  System::Call 'kernel32::GetCurrentProcessId() i.r0'
  StrCpy $LogFile "$TEMP\Lumeria-${KIND}-$0.log"
  !ifdef LUMERIA_TEST_LOG_ROOT
    StrCpy $LogFile "${LUMERIA_TEST_LOG_ROOT}\nsis-${KIND}-$0.log"
  !endif
  FileOpen $LogHandle "$LogFile" w
  FileWriteUTF16LE /BOM $LogHandle ""
  !insertmacro Trace "Command: $CMDLINE"
!macroend

!macro SafeDirectory PREFIX
Function ${PREFIX}CheckDirectory
  ; $0 is the candidate. Reject links in every existing ancestor.
  Push $1
  Push $2
  Push $3
  System::Call 'kernel32::GetFullPathNameW(w r0, i ${NSIS_MAX_STRLEN}, w .r1, p 0) i.r2'
  ${If} $2 == 0
  ${OrIf} $2 >= ${NSIS_MAX_STRLEN}
    Goto unsafe
  ${EndIf}
  StrCpy $0 $1
  StrLen $1 $0
  ${If} $1 < 4
    Goto unsafe
  ${EndIf}
  ${If} $0 == "$PROFILE"
  ${OrIf} $0 == "$APPDATA"
  ${OrIf} $0 == "$LOCALAPPDATA"
  ${OrIf} $0 == "$WINDIR"
  ${OrIf} $0 == "$SYSDIR"
  ${OrIf} $0 == "$PROGRAMFILES"
  ${OrIf} $0 == "$PROGRAMFILES64"
    Goto unsafe
  ${EndIf}
  StrCpy $1 $0
  loop:
    System::Call 'kernel32::GetFileAttributesW(w r1) i.r2'
    ${If} $2 != -1
      IntOp $3 $2 & 0x400
      ${If} $3 != 0
        Goto unsafe
      ${EndIf}
    ${EndIf}
    ${GetParent} "$1" $2
    ${If} $2 != ""
    ${AndIf} $2 != $1
      StrCpy $1 $2
      Goto loop
    ${EndIf}
    StrCpy $Result 0
    Goto done
  unsafe:
    StrCpy $Result 1
  done:
  Pop $3
  Pop $2
  Pop $1
FunctionEnd
!macroend
!insertmacro SafeDirectory ""
!insertmacro SafeDirectory "un."

Function .onInit
  SetShellVarContext current
  SetRegView 64
  !insertmacro OpenLog "setup"
  ${IfNot} ${RunningX64}
    SetErrorLevel 1
    Abort "Lumeria requires 64-bit Windows."
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    SetErrorLevel 1
    Abort "Lumeria requires Windows 10 or later."
  ${EndIf}
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\com.lumeria.app.installer") p.r0 ?e'
  Pop $1
  StrCpy $InstallerMutex $0
  ${If} $0 == 0
    SetErrorLevel 1
    Abort "Unable to acquire the installer lock."
  ${EndIf}
  ${If} $1 == 183
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(Busy)" /SD IDOK
    SetErrorLevel 1
    Abort
  ${EndIf}
  ; Pre-release Electrobun installations use a different installation identity.
  ; Explicit isolated data profiles (used by release tests) do not share theirs.
  ReadEnvStr $0 "LUMERIA_NATIVE_DATA_DIR"
  ${If} $0 == ""
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\dev.lumeria.launchpad-native.stable" "UninstallString"
    ${If} $0 != ""
      !insertmacro Trace "Legacy preview detected; explicit one-time migration required"
      MessageBox MB_OK|MB_ICONINFORMATION "$(LegacyPreview)" /SD IDOK
      SetErrorLevel 1
      Abort
    ${EndIf}
  ${EndIf}
  ReadRegStr $RegisteredDirectory HKCU "Software\com.lumeria.app" "InstallLocation"
  StrCpy $HasPrevious 0
  StrCpy $Committed 0
  !insertmacro Trace "Initial directory: $INSTDIR; registered: $RegisteredDirectory"
FunctionEnd

Function .onGUIEnd
  ${If} $InstallerMutex != ""
    System::Call 'kernel32::CloseHandle(p $InstallerMutex)'
  ${EndIf}
FunctionEnd

Function RegisterInstallation
  ClearErrors
  ReadINIStr $InstallVersion "$INSTDIR\install.ini" "Lumeria" "Version"
  ReadINIStr $InstallSize "$INSTDIR\install.ini" "Lumeria" "SizeKiB"
  WriteRegStr HKCU "Software\com.lumeria.app" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\com.lumeria.app" "Version" "$InstallVersion"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.lumeria.app" "DisplayName" "Lumeria"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.lumeria.app" "DisplayVersion" "$InstallVersion"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.lumeria.app" "Publisher" "Lumeria"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.lumeria.app" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.lumeria.app" "DisplayIcon" "$INSTDIR\Lumeria.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.lumeria.app" "UninstallString" '$\"$INSTDIR\uninstall.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.lumeria.app" "QuietUninstallString" '$\"$INSTDIR\uninstall.exe$\" /S'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.lumeria.app" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.lumeria.app" "NoRepair" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.lumeria.app" "EstimatedSize" $InstallSize
  CreateShortCut "$DESKTOP\Lumeria.lnk" "$INSTDIR\Lumeria.exe" "" "$INSTDIR\Lumeria.exe"
  CreateShortCut "$SMPROGRAMS\Lumeria.lnk" "$INSTDIR\Lumeria.exe" "" "$INSTDIR\Lumeria.exe"
FunctionEnd

Section "Lumeria" SEC_MAIN
  !insertmacro Trace "Checking destination: $INSTDIR"
  StrCpy $0 $INSTDIR
  Call CheckDirectory
  StrCpy $INSTDIR $0
  !insertmacro Trace "Resolved destination: $INSTDIR; validation: $Result"
  ${If} $Result != 0
    Goto unsafe_directory
  ${EndIf}
  ${If} $INSTDIR == "$APPDATA\com.lumeria.app"
    Goto unsafe_directory
  ${EndIf}
  StrCpy $0 "$APPDATA\com.lumeria.app\"
  StrLen $1 $0
  StrCpy $2 "$INSTDIR\" $1
  ${If} $2 == $0
    Goto unsafe_directory
  ${EndIf}
  ${If} $RegisteredDirectory != ""
    GetFullPathName $1 "$RegisteredDirectory"
    StrCpy $RegisteredDirectory $1
    ${If} $RegisteredDirectory != $INSTDIR
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(KeepDirectory)" /SD IDOK
      SetErrorLevel 1
      Abort
    ${EndIf}
  ${EndIf}
  IfFileExists "$INSTDIR\install.ini" existing_install
  ; An arbitrary nonempty directory must never become an installation backup.
  FindFirst $0 $1 "$INSTDIR\*.*"
  directory_entry:
    ${If} $1 == ""
      FindClose $0
      Goto prepare
    ${EndIf}
    ${If} $1 != "."
    ${AndIf} $1 != ".."
      FindClose $0
      Goto unsafe_directory
    ${EndIf}
    FindNext $0 $1
    Goto directory_entry
  existing_install:
    ReadINIStr $0 "$INSTDIR\install.ini" "Lumeria" "Identifier"
    ${If} $0 != "com.lumeria.app"
      Goto unsafe_directory
    ${EndIf}
    IfFileExists "$INSTDIR\uninstall.exe" +2
      Goto unsafe_directory
    ReadINIStr $0 "$INSTDIR\install.ini" "Lumeria" "Version"
    ${VersionCompare} "${PRODUCT_VERSION}" "$0" $1
    ${If} $1 == 2
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(OlderVersion)" /SD IDOK
      SetErrorLevel 1
      Abort
    ${EndIf}
    StrCpy $HasPrevious 1
  prepare:
    !insertmacro Trace "Preparing installation; previous: $HasPrevious"
    System::Call 'kernel32::GetCurrentProcessId() i.r0'
    StrCpy $Incoming "$INSTDIR.lumeria-new-$0"
    StrCpy $Backup "$INSTDIR.lumeria-old-$0"
    IfFileExists "$Incoming" unsafe_directory
    IfFileExists "$Backup" unsafe_directory
    ClearErrors
    CreateDirectory "$Incoming"
    IfErrors payload_failed
    !insertmacro LumeriaExtract "$Incoming" payload_failed
    !insertmacro Trace "Payload extracted into $Incoming"
    WriteUninstaller "$Incoming\uninstall.exe"
    IfErrors payload_failed
    FileOpen $0 "$Incoming\install.ini" w
    FileWriteUTF16LE /BOM $0 ""
    FileClose $0
    IfErrors payload_failed
    WriteINIStr "$Incoming\install.ini" "Lumeria" "Identifier" "com.lumeria.app"
    WriteINIStr "$Incoming\install.ini" "Lumeria" "Version" "${PRODUCT_VERSION}"
    WriteINIStr "$Incoming\install.ini" "Lumeria" "SizeKiB" "${PRODUCT_SIZE_KIB}"
    WriteINIStr "$Incoming\install.ini" "Lumeria" "InstallLocation" "$INSTDIR"
    IfErrors payload_failed
    SetOutPath "$TEMP"
    !insertmacro Trace "Payload ready; preparing directory replacement"
    ${If} $HasPrevious == 1
      ClearErrors
      ExecWait '$\"$INSTDIR\Lumeria.exe$\" --lumeria-shutdown' $0
      ${If} ${Errors}
      ${OrIf} $0 != 0
        MessageBox MB_OK|MB_ICONEXCLAMATION "$(CloseFailed)" /SD IDOK
        Goto payload_failed
      ${EndIf}
      ClearErrors
      Rename "$INSTDIR" "$Backup"
      IfErrors payload_failed
    ${Else}
      RMDir "$INSTDIR"
    ${EndIf}
    ClearErrors
    Rename "$Incoming" "$INSTDIR"
    IfErrors rollback
    StrCpy $Committed 1
    !insertmacro Trace "New installation moved into place"
    !ifdef LUMERIA_TEST_FAIL_COMMIT
      Goto rollback
    !endif
    Call RegisterInstallation
    IfErrors rollback
    !insertmacro LumeriaMigrateAutostart "Software\Microsoft\Windows\CurrentVersion\Run" rollback
    ${If} $HasPrevious == 1
      ClearErrors
      ExecWait '$\"$Backup\uninstall.exe$\" /S /UPGRADE _?=$Backup' $0
      ${IfNot} ${Errors}
      ${AndIf} $0 == 0
        Delete "$Backup\uninstall.exe"
        RMDir "$Backup"
        ${If} ${FileExists} "$Backup"
          !insertmacro Trace "Unowned files preserved at $Backup"
        ${EndIf}
      ${Else}
        DetailPrint "Previous installation retained at $Backup"
        MessageBox MB_OK|MB_ICONEXCLAMATION "$(CleanupFailed)$\r$\n$Backup" /SD IDOK
      ${EndIf}
    ${EndIf}
    SetErrorLevel 0
    Goto finished
  rollback:
    !insertmacro Trace "Rolling back installation"
    DetailPrint "Restoring the previous installation"
    ${If} $Committed == 1
      ClearErrors
      Rename "$INSTDIR" "$Incoming"
      IfErrors rollback_failed
    ${EndIf}
    ${If} $HasPrevious == 1
      ClearErrors
      Rename "$Backup" "$INSTDIR"
      IfErrors rollback_failed
      Call RegisterInstallation
    ${Else}
      DeleteRegKey HKCU "Software\com.lumeria.app"
      DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.lumeria.app"
      Delete "$DESKTOP\Lumeria.lnk"
      Delete "$SMPROGRAMS\Lumeria.lnk"
    ${EndIf}
    Goto payload_failed
  rollback_failed:
    DetailPrint "Recovery requires inspection: $Backup and $Incoming"
    MessageBox MB_OK|MB_ICONSTOP "$(InstallFailed)$\r$\n$Backup$\r$\n$Incoming" /SD IDOK
    SetErrorLevel 1
    Abort
  payload_failed:
    !insertmacro Trace "Installation stopped; incoming: $Incoming; backup: $Backup"
    SetOutPath "$TEMP"
    !insertmacro LumeriaRemove "$Incoming" cleanup_failed
    Delete "$Incoming\install.ini"
    Delete "$Incoming\uninstall.exe"
    RMDir "$Incoming"
  cleanup_failed:
    MessageBox MB_OK|MB_ICONSTOP "$(InstallFailed)" /SD IDOK
    SetErrorLevel 1
    Abort
  unsafe_directory:
    !insertmacro Trace "Destination rejected: $INSTDIR"
    MessageBox MB_OK|MB_ICONSTOP "$(UnsafeDirectory)" /SD IDOK
    SetErrorLevel 1
    Abort
  finished:
    ${If} $InstallerMutex != ""
      System::Call 'kernel32::CloseHandle(p $InstallerMutex)'
      StrCpy $InstallerMutex ""
    ${EndIf}
SectionEnd

Function un.onInit
  SetShellVarContext current
  SetRegView 64
  !insertmacro OpenLog "uninstall"
  StrCpy $UpgradeCleanup 0
  StrCpy $PurgeData 0
  StrCpy $DataDirectory "$APPDATA\com.lumeria.app"
  !ifdef LUMERIA_TEST_DATA_ROOT
    StrCpy $DataDirectory "${LUMERIA_TEST_DATA_ROOT}"
  !endif
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} "$0" "/UPGRADE" $1
  ${IfNot} ${Errors}
    StrCpy $UpgradeCleanup 1
  ${EndIf}
  ClearErrors
  ${GetOptions} "$0" "/PURGEDATA" $1
  ${IfNot} ${Errors}
    StrCpy $PurgeData 1
  ${EndIf}
  StrCpy $0 $INSTDIR
  Call un.CheckDirectory
  ${If} $Result != 0
    SetErrorLevel 1
    Abort
  ${EndIf}
  ReadINIStr $0 "$INSTDIR\install.ini" "Lumeria" "Identifier"
  ${If} $0 != "com.lumeria.app"
    SetErrorLevel 1
    Abort "This folder is not a Lumeria installation."
  ${EndIf}
    ${If} $UpgradeCleanup == 1
    ReadINIStr $0 "$INSTDIR\install.ini" "Lumeria" "InstallLocation"
    StrCpy $0 "$0.lumeria-old-"
    StrLen $1 $0
    StrCpy $2 $INSTDIR $1
    ${If} $2 != $0
      SetErrorLevel 1
      Abort
    ${EndIf}
  ${Else}
    System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\com.lumeria.app.installer") p.r0 ?e'
    Pop $1
    StrCpy $InstallerMutex $0
    ${If} $0 == 0
      SetErrorLevel 1
      Abort "Unable to acquire the uninstall lock."
    ${EndIf}
    ${If} $1 == 183
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(Busy)" /SD IDOK
      SetErrorLevel 1
      Abort
    ${EndIf}
    ReadRegStr $0 HKCU "Software\com.lumeria.app" "InstallLocation"
    GetFullPathName $1 "$0"
    ${If} $1 != $INSTDIR
      SetErrorLevel 1
      Abort "The registered Lumeria installation is in another folder."
    ${EndIf}
  ${EndIf}
FunctionEnd

Function un.DataPage
  ${If} $UpgradeCleanup == 1
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "$(PurgeTitle)" "$(PurgeDescription)"
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 30u "$(PurgeDescription)$\r$\n$DataDirectory"
  Pop $0
  ${NSD_CreateCheckbox} 0 45u 100% 30u "$(PurgeChoice)"
  Pop $DataCheckbox
  ${NSD_SetState} $DataCheckbox $PurgeData
  nsDialogs::Show
FunctionEnd

Function un.DataPageLeave
  ${NSD_GetState} $DataCheckbox $PurgeData
FunctionEnd

; Validate the entire data tree before any recursive removal, including links.
Function un.ValidateDataTree
  Push $0
  Push $1
  Push $2
  Push $3
  StrCpy $0 $ScanDirectory
  Call un.CheckDirectory
  ${If} $Result != 0
    Goto data_done
  ${EndIf}
  FindFirst $1 $2 "$ScanDirectory\*.*"
  data_loop:
    ${If} $2 == ""
      Goto data_close
    ${EndIf}
    ${If} $2 != "."
    ${AndIf} $2 != ".."
      System::Call 'kernel32::GetFileAttributesW(w "$ScanDirectory\$2") i.r3'
      IntOp $0 $3 & 0x400
      ${If} $0 != 0
        StrCpy $Result 1
        Goto data_close
      ${EndIf}
      IntOp $0 $3 & 0x10
      ${If} $0 != 0
        Push $ScanDirectory
        StrCpy $ScanDirectory "$ScanDirectory\$2"
        Call un.ValidateDataTree
        Pop $ScanDirectory
        ${If} $Result != 0
          Goto data_close
        ${EndIf}
      ${EndIf}
    ${EndIf}
    FindNext $1 $2
    Goto data_loop
  data_close:
    FindClose $1
  data_done:
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

Section "Uninstall"
  SetOutPath "$TEMP"
  ${If} $UpgradeCleanup != 1
    ClearErrors
    ExecWait '$\"$INSTDIR\Lumeria.exe$\" --lumeria-shutdown' $0
    ${If} ${Errors}
    ${OrIf} $0 != 0
      MessageBox MB_OK|MB_ICONSTOP "$(CloseFailed)" /SD IDOK
      SetErrorLevel 1
      Abort
    ${EndIf}
    ${If} $PurgeData == 1
      StrCpy $ScanDirectory $DataDirectory
      Call un.ValidateDataTree
      ${If} $Result != 0
        Goto uninstall_failed
      ${EndIf}
    ${EndIf}
  ${EndIf}
  !insertmacro LumeriaRemove "$INSTDIR" uninstall_failed
  ${If} $UpgradeCleanup != 1
    ClearErrors
    !insertmacro LumeriaRemoveAutostart "Software\Microsoft\Windows\CurrentVersion\Run" "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
    Delete "$DESKTOP\Lumeria.lnk"
    Delete "$SMPROGRAMS\Lumeria.lnk"
    DeleteRegKey HKCU "Software\com.lumeria.app"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.lumeria.app"
    ${If} $PurgeData == 1
      ClearErrors
      IfFileExists "$DataDirectory" 0 +2
        RMDir /r "$DataDirectory"
      IfErrors uninstall_failed
    ${EndIf}
    Delete "$INSTDIR\uninstall.exe"
  ${EndIf}
  Delete "$INSTDIR\install.ini"
  RMDir "$INSTDIR"
  SetErrorLevel 0
  Goto uninstall_done
  uninstall_failed:
    DetailPrint "Files retained in $INSTDIR or $DataDirectory"
    MessageBox MB_OK|MB_ICONSTOP "$(CleanupFailed)" /SD IDOK
    SetErrorLevel 1
    Abort
  uninstall_done:
SectionEnd
