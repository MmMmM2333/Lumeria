!ifndef LUMERIA_AUTOSTART_INCLUDED
!define LUMERIA_AUTOSTART_INCLUDED
!include "LogicLib.nsh"

; Only migrate this installation's exact legacy command. Do not change the
; StartupApproved value: a user-disabled entry must stay disabled.
!macro LumeriaMigrateAutostart RUN_KEY FAILURE
  ReadRegStr $0 HKCU "${RUN_KEY}" "Lumeria"
  ${If} $0 == '$\"\\?\$INSTDIR\Lumeria.exe$\" --lumeria-autostart'
    ClearErrors
    WriteRegStr HKCU "${RUN_KEY}" "Lumeria" '$\"$INSTDIR\Lumeria.exe$\" --lumeria-autostart'
    IfErrors ${FAILURE}
  ${EndIf}
!macroend

!macro LumeriaRemoveAutostart RUN_KEY APPROVED_KEY
  ReadRegStr $0 HKCU "${RUN_KEY}" "Lumeria"
  ${If} $0 == '$\"$INSTDIR\Lumeria.exe$\" --lumeria-autostart'
  ${OrIf} $0 == '$\"\\?\$INSTDIR\Lumeria.exe$\" --lumeria-autostart'
    DeleteRegValue HKCU "${RUN_KEY}" "Lumeria"
    DeleteRegValue HKCU "${APPROVED_KEY}" "Lumeria"
  ${EndIf}
!macroend
!endif
