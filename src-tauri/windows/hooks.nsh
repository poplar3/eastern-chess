; До версии 0.4 приложение называлось «Janggi» и ставилось в отдельную папку.
; Новый установщик («Eastern Chess») молча удаляет старую копию, чтобы на компьютере
; не оставалось двух приложений. Настройки и сохранённые партии лежат в папке
; по идентификатору io.github.poplar3.janggi и при этом не трогаются.
!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Janggi" "UninstallString"
  ${If} $R0 != ""
    DetailPrint "Удаление старой версии (Janggi)..."
    ExecWait '$R0 /S'
  ${EndIf}
!macroend
