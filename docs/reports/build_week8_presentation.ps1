$ErrorActionPreference = 'Stop'
$week8Output = $PSScriptRoot
$week8PowerPoint = New-Object -ComObject PowerPoint.Application
$week8Deck = $week8PowerPoint.Presentations.Add(0)
$week8Deck.PageSetup.SlideWidth = 960
$week8Deck.PageSetup.SlideHeight = 540
$week8Purple = 0xB6215B
$week8Ink = 0x331811
$week8Gray = 0x806B64

function Add-Text($slide, [string]$value, [float]$left, [float]$top, [float]$width, [float]$height, [float]$size = 22, [bool]$bold = $false, [int]$color = 0x331811) {
    $shape = $slide.Shapes.AddTextbox(1, $left, $top, $width, $height)
    $shape.TextFrame.MarginLeft = 0
    $shape.TextFrame.MarginRight = 0
    $shape.TextFrame.WordWrap = -1
    $shape.TextFrame.TextRange.Text = $value
    $shape.TextFrame.TextRange.Font.Name = '맑은 고딕'
    $shape.TextFrame.TextRange.Font.Size = $size
    $shape.TextFrame.TextRange.Font.Bold = [int]$bold * -1
    $shape.TextFrame.TextRange.Font.Color.RGB = $color
    return $shape
}

function Add-Slide([string]$title, [string]$time) {
    $slide = $week8Deck.Slides.Add($week8Deck.Slides.Count + 1, 12)
    $slide.FollowMasterBackground = 0
    $slide.Background.Fill.ForeColor.RGB = 0xFCFAF8
    $null = Add-Text $slide 'CAPSTONE / BLOCKCHAIN VOTING' 42 20 800 24 11 $true $week8Purple
    $null = Add-Text $slide $title 42 58 880 72 30 $true $week8Ink
    $null = Add-Text $slide ('7~8주차 · 2026.10.24') 42 508 600 20 11 $false $week8Gray
    $null = Add-Text $slide ($time + '  |  ' + $slide.SlideIndex + '/5') 760 508 160 20 11 $false $week8Gray
    return $slide
}

try {
    $s = Add-Slide '전자투표 보안 진단과 개선' '20초'
    $null = Add-Text $s "선거 중 등록 차단 · 결과 확정 · 감사 로그" 44 142 870 60 25 $false $week8Gray
    $null = Add-Text $s "12종" 48 255 270 85 54 $true $week8Purple
    $null = Add-Text $s "이벤트 기록" 48 345 270 50 20
    $null = Add-Text $s "47개" 350 255 270 85 54 $true $week8Purple
    $null = Add-Text $s "자동 테스트 통과" 350 345 270 50 20
    $null = Add-Text $s "15건" 660 255 270 85 54 $true $week8Purple
    $null = Add-Text $s "취약점 진단 항목" 660 345 270 50 20
    $null = Add-Text $s '진단 → 근거 → 조치 → 검증을 연결해 기록' 48 432 860 40 21 $true

    $s = Add-Slide '등록과 결과 확정의 경계 보완' '40초'
    $null = Add-Text $s '선거 중 등록' 44 145 270 40 24 $true $week8Purple
    $null = Add-Text $s "관리자 단독 추가 가능`r`n↓`r`n시작 후 등록 영구 차단" 44 205 400 175 24
    $null = Add-Text $s '종료 후 결과' 500 145 380 40 24 $true $week8Purple
    $null = Add-Text $s "화면 시계 ≠ 마지막 블록 시각`r`n↓`r`nfinalize 거래로 결과 저장" 500 205 420 175 24
    $null = Add-Text $s "화면 검증 추가 조치: 종료 경계 1초 정렬 + 오래된 블록의 가스 추정 실패 대응" 44 422 870 65 19 $true

    $s = Add-Slide '8주차: 행위 기록 6종 → 12종' '35초'
    $null = Add-Text $s "등록·후보 추가·투표 사실`r`n관리자 추가·제거·선거 시작" 46 148 870 110 28 $true $week8Purple
    $null = Add-Text $s "제안 → 승인 → 실행 → 반영 결과" 46 285 870 50 27 $true
    $null = Add-Text $s '제안 번호 · 거래 해시 · 로그 순번으로 원본 대조' 46 350 870 50 22
    $null = Add-Text $s "투표 이벤트에서 후보 번호 제외`r`n거래 입력은 공개되므로 익명성은 미해결" 46 420 870 65 19 $false $week8Gray

    $s = Add-Slide '테스트와 화면으로 결과 확인' '40초'
    $null = Add-Text $s '36 → 47 passing' 44 145 440 50 30 $true $week8Purple
    $null = Add-Text $s "42개  동작·보완 검증`r`n 5개  남은 취약점 재현" 44 218 440 95 23
    $null = Add-Text $s "최초 관리자 없이 2명 승인`r`n관리자 제거도 2명 승인`r`n실제 대기 후 화면에서 확정" 44 337 440 130 21
    $week8Screenshot = Join-Path $week8Output '../evidence/week8/browser/05-finalized-winner.png'
    if (!(Test-Path -LiteralPath $week8Screenshot)) { throw '최종 화면 검증 캡처가 없습니다.' }
    $picture = $s.Shapes.AddPicture((Resolve-Path -LiteralPath $week8Screenshot).Path, 0, -1, 510, 128, -1, -1)
    $picture.LockAspectRatio = -1
    if ($picture.Width / $picture.Height -gt 400 / 330) { $picture.Width = 400 } else { $picture.Height = 330 }
    $null = Add-Text $s "테스트 지갑 자동 검증 캡처`r`n실제 MetaMask 투표·확정도 별도 검증 완료" 510 465 410 38 11 $false $week8Gray

    $s = Add-Slide '현황과 다음 단계' '25초'
    $null = Add-Text $s '해결 7 · 부분 해결 2 · 예정 6' 44 150 870 70 35 $true $week8Purple
    $null = Add-Text $s "9~10주차 보완`r`n관리자 인원 계산 · 확정 전 재시작`r`n동점 처리 · 정지 중 결과 조회" 44 255 870 150 26
    $null = Add-Text $s '최종 결과물: 취약점진단보고서 + 개선된 투표시스템' 44 437 870 45 21 $true

    $week8Deck.SaveAs((Join-Path $week8Output 'week8_presentation.pptx'), 24)
    $week8Deck.SaveAs((Join-Path $week8Output 'week8_presentation.pdf'), 32)
    $week8Deck.Export((Join-Path $week8Output '../evidence/week8/slides'), 'PNG', 1440, 810)
    Write-Output ('Presentation ready: ' + $week8Deck.Slides.Count + ' slides / target 160 seconds')
} finally {
    $week8Deck.Close()
    $week8PowerPoint.Quit()
}
