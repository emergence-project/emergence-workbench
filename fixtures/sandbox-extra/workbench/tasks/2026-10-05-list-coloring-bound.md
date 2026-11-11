---
title: Kempe 바꾸기 횟수 수치 확인
topic: coloring
agent: claude-code
created: 2026-10-05 09:10
state: result
task: 꼭짓점 12개 이하의 무작위 평면 그래프에서, Kempe 바꾸기로 칠한 색칠이 다섯 색 안에 들고 바꾸기 횟수가 n² 한계 안에 드는지 수치로 확인한다.
end-condition: 무작위 그래프 1000개에서 한계를 넘는 경우가 0개, 시드 3개 일치
references: [workbench/notes/kempe-recoloring/note.md]
avoid: 연구노트 본문은 고치지 않는다
result-at: 2026-10-06 12:59
conclusion: 1000개 모두 한계 안에 들었고, 꼭짓점이 10개를 넘으면 한계가 실제 횟수의 4배 이상으로 느슨해진다.
end-check: pass
ask:
  - 이 결론을 연구노트 "Kempe 사슬로 다시 칠하기"에 반영할까요?
  - { q: 반영한다면 어디에 넣을까요?, options: [결론 절, 새 절, 부록] }
issues:
  - { text: "꼭짓점 13개 이상은 계산하지 않아, 느슨해지는 정도가 크기에 따라 달라질 수 있다", impact: 결론의 숫자를 바꿀 수 있음, next: 1 }
  - { text: Kempe 바꾸기 대신 방전법 순서를 쓰면 한계가 바뀌는지 보지 않았다, impact: 결론과 따로, next: 2 }
next:
  - { task: 꼭짓점 13개 무작위 그래프 1000개로 같은 비교를 한다, end-condition: 느슨해지는 비율의 오차 ±10% 이내 }
  - { task: 방전법 순서로 같은 비교를 한다, end-condition: 시드 3개에서 같은 결론 }
  - { task: 연구노트 결론 절 초안 쓰기, end-condition: 본문은 고치지 않고 초안 파일 하나 }
outputs: [scripts/kempe_bound.py, data/kempe-bound/results.csv]
check: { machine: 수치 대조 통과 (test_kempe_bound.py) · 2026-10-06 }
---
## 요약과 결론

쉽게 말하면, 평면 그래프는 Kempe 바꾸기로 언제나 다섯 색 안에 칠할 수 있고 바꾸기 횟수의 한계도 맞았지만, 꼭짓점이 조금만 많아져도 한계가 실제보다 훨씬 크게 잡힙니다. 세 시드에서 모두 같았습니다.

## 근거

- 무작위 평면 그래프 1000개를 만들고 색 수 $\chi(G)$와 Kempe 바꾸기 횟수를 쟀습니다.
- 한계 $n^2$을 넘는 경우는 0개였습니다.
- $n > 10$에서는 한계 ÷ 실제 횟수가 4배를 넘었습니다.
