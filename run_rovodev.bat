@ECHO OFF
SETLOCAL ENABLEDELAYEDEXPANSION

:: ===================================================================
::                      RovoDev 启动器 (动态菜单版)
:: ===================================================================
:: 版本: 10.0 (The Dynamic Version)
:: 功能: 1. 自动设置代理。
::       2. [新] 动态生成账户菜单，添加新账户更方便。
::       3. 可跳過登录，直接运行。
::       4. 可查看当前登录状态。
::       5. 会话结束后自动返回主菜单，实现无缝切换。
::       6. 登录逻辑与官方文档完全对齐，代码更简洁。
:: ===================================================================


::---------------------------------
:: 1. 用户配置区域 (未来只需在此处操作)
::---------------------------------
:: <-- [重要] 每次增删账户后，请更新此处的账户总数
SET "ACCOUNT_COUNT=4"

SET "PROXY_URL=http://127.0.0.1:10808"

SET "EMAIL_1=nankawachie@gmail.com"
SET "API_KEY_1=ATATT3xFfGF0dEw4rnjiq0p3UdgkxHo0MsptSUSjMBU3VAHuftMli75UNz4wzBjXoJioEXxoBZUI_3QQa3QbuPKhtzjIG8xeF2ZSwJrGGKGoKAzyBkveHvqsHBq6lxfSeAJBsD4XHUEB4d2d8UtP8G9crKMOVm1HCa9Fa-nJkMfy0KPc3bWjGVY=EA1B1A80"

SET "EMAIL_2=uncreatedjec@gmail.com"
SET "API_KEY_2=ATATT3xFfGF0vPDS9Vu1ZyHCJa4Z0IxdRndg5YcLzrFAoBTRZ2BZh6eQnjrjpCl-50spF2ijEKM4CcnG-8-WYV926oyoqiA0dWL0TeXPhWFaX6sWzdnbebejQdJM30dDY9z3vreGI61heVvSOICi2YMRLrQ26h43HPs9kbqqtOSDnqSk3CRVlgg=B5915432"

SET "EMAIL_3=3262266231@qq.com"
SET "API_KEY_3=ATATT3xFfGF02NXe-73-JvS1OWbyz0gr9_WzLE0h2_zS9g4DEXGI9LYy3zw6kyeLnG1n3ZHdzf0AYNsPIB6G9R9Ms9peBSLUfT2lBDNm1GHZgSxfodVRrhIbvEMlUxnL9YsN1V-0HXg25zCLV-zJ4ONnBE5MIiVMnbhEH0Qt8hzxBQKuwXrjA68=A7A33089"

SET "EMAIL_4=xmare6641@gmail.com"
SET "API_KEY_4=ATATT3xFfGF05c8SC5Fz2xFx6ggm48zhKQ6909AUvi4jdAVDZDx4BICmsv-1ELbl-aMeiBYwk9OZuwRb5myYFnsmhzLWx8eSU41Wj_LdTw7pQTjNJwbzBMGzOOR312d51G5X4mW4P6YT9yB-478Sw16dJRiffQZh3NqJhp-OIIe7HtON5pFKqR0=269BF7C2"


::---------------------------------
:: 2. 设置环境
::---------------------------------
TITLE RovoDev 启动器 (代理与账户切换模式)
CLS
ECHO.
ECHO  ========================================================
ECHO   正在为您设置网络代理: %PROXY_URL%
ECHO  ========================================================
ECHO.
SET "HTTP_PROXY=%PROXY_URL%"
SET "HTTPS_PROXY=%PROXY_URL%"
SET "NODE_TLS_REJECT_UNAUTHORIZED=0"


:account_menu
::---------------------------------
:: 3. 账户/模式选择菜单 (动态生成)
::---------------------------------
CLS
ECHO ===================================
ECHO      RovoDev Assistant 启动模式
ECHO ===================================
ECHO.
ECHO   --- 登录新账户 ---
:: <-- [动态菜单] 使用 FOR 循环根据 ACCOUNT_COUNT 自动生成账户列表
FOR /L %%i IN (1, 1, %ACCOUNT_COUNT%) DO (
    ECHO   %%i. 登录账户 %%i (!EMAIL_%%i!)
)
ECHO.
ECHO   --- 其他操作 ---
:: <-- [动态编号] 自动计算 "其他操作" 选项的编号
SET /A "STATUS_OPTION = %ACCOUNT_COUNT% + 1"
SET /A "SKIP_OPTION = %ACCOUNT_COUNT% + 2"
SET /A "EXIT_OPTION = %ACCOUNT_COUNT% + 3"

ECHO   %STATUS_OPTION%. 查看当前登录状态
ECHO   %SKIP_OPTION%. 跳过登录，直接运行 (使用当前账号)
ECHO.
ECHO   %EXIT_OPTION%. 退出脚本
ECHO.

SET /P account_choice=请输入你的选择 (1-%EXIT_OPTION%), 然后按回车: 

:: <-- [动态逻辑] 判断输入是否在账户范围内
IF %account_choice% GEQ 1 IF %account_choice% LEQ %ACCOUNT_COUNT% (
    SET "CURRENT_EMAIL=!EMAIL_%account_choice%!"
    SET "CURRENT_API_KEY=!API_KEY_%account_choice%!"
    GOTO login_process
)

:: <-- [动态逻辑] 使用计算出的编号进行判断
IF "%account_choice%"=="%STATUS_OPTION%" GOTO show_status
IF "%account_choice%"=="%SKIP_OPTION%" CLS & GOTO run_menu
IF "%account_choice%"=="%EXIT_OPTION%" GOTO end

ECHO.
ECHO  输入无效，请输入 1 到 %EXIT_OPTION% 之间的数字。
PAUSE
GOTO account_menu


:login_process
::---------------------------------
:: 4. 自动化登录流程 (此部分无需修改)
::---------------------------------
CLS
ECHO.
ECHO  ========================================================
ECHO   正在为您切换账户: !CURRENT_EMAIL!
ECHO  ========================================================
ECHO.
ECHO  > 步骤 1/2: 正在登出...
acli rovodev auth logout 2>NUL
ECHO.
ECHO  > 步骤 2/2: 正在登录...
ECHO !CURRENT_API_KEY! | acli rovodev auth login --email !CURRENT_EMAIL! --token

ECHO.
ECHO  --------------------------------------------------------
ECHO   账户登录流程执行完毕!
ECHO  --------------------------------------------------------
PAUSE
CLS
GOTO run_menu


:show_status
::---------------------------------
:: 查看当前登录状态 (此部分无需修改)
::---------------------------------
CLS
ECHO.
ECHO  ========================================================
ECHO   正在查询当前登录状态...
ECHO  ========================================================
ECHO.
acli rovodev auth status
ECHO.
ECHO  --------------------------------------------------------
ECHO   查询完毕。按任意键返回主菜单...
ECHO  --------------------------------------------------------
PAUSE
GOTO account_menu


:run_menu
::---------------------------------
:: 5. 运行选项菜单 (此部分无需修改)
::---------------------------------
ECHO ===================================
ECHO      RovoDev Assistant 启动选项
ECHO ===================================
ECHO.
ECHO   1. 开始新的对话 (不加载历史记录)
ECHO   2. 载入之前的对话 (加载历史记录)
ECHO.
ECHO   3. 返回主菜单 (可切换账户或退出)
ECHO.

SET /P choice=请输入你的选择 (1, 2 或 3), 然后按回车: 

IF "%choice%"=="1" GOTO start_new
IF "%choice%"=="2" GOTO restore_old
IF "%choice%"=="3" GOTO account_menu

ECHO.
ECHO  输入无效，请输入 1, 2 或 3。
PAUSE
GOTO run_menu


:start_new
ECHO.
ECHO  正在启动新的对话...
acli rovodev run
ECHO.
ECHO  ========================================================
ECHO    会话已结束。按任意键返回主菜单...
ECHO  ========================================================
PAUSE
GOTO account_menu


:restore_old
ECHO.
ECHO  正在载入之前的对话...
acli rovodev run --restore
ECHO.
ECHO  ========================================================
ECHO    会话已结束。按任意键返回主菜单...
ECHO  ========================================================
PAUSE
GOTO account_menu


:end
ECHO.
ECHO  脚本已终止。
EXIT