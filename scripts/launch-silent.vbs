' =====================================================================
' COUNTY ADOPTION RECORDS SYSTEM (AODS)
' Zero-Console Silent Windows Launcher
' Launches the WPF loading screen without displaying any terminal window
' =====================================================================

Option Explicit

Dim oShell, oFso, strScriptsDir, strProjectRoot, strGuiScript, strPowerShell, strCmd, strArgs, i

Set oShell = CreateObject("WScript.Shell")
Set oFso = CreateObject("Scripting.FileSystemObject")

' Locate scripts folder and project root
strScriptsDir = oFso.GetParentFolderName(WScript.ScriptFullName)
strProjectRoot = oFso.GetParentFolderName(strScriptsDir)
strGuiScript = strScriptsDir & "\launch-gui.ps1"

If Not oFso.FileExists(strGuiScript) Then
    MsgBox "Unable to locate AODS launcher script at:" & vbCrLf & strGuiScript, vbCritical, "AODS Launcher Error"
    WScript.Quit 1
End If

' Resolve explicit powershell.exe binary
strPowerShell = oShell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")
If Not oFso.FileExists(strPowerShell) Then
    strPowerShell = "powershell.exe"
End If

' Build pass-through arguments (e.g. -NoBrowser)
strArgs = ""
For i = 0 To WScript.Arguments.Count - 1
    strArgs = strArgs & " """ & WScript.Arguments(i) & """"
Next

' Execute PowerShell in hidden window mode (0 = SW_HIDE, False = asynchronous)
strCmd = """" & strPowerShell & """ -ExecutionPolicy Bypass -NoProfile -NonInteractive -WindowStyle Hidden -File """ & strGuiScript & """" & strArgs
oShell.CurrentDirectory = strProjectRoot
oShell.Run strCmd, 0, False

Set oShell = Nothing
Set oFso = Nothing
