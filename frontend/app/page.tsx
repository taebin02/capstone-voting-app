"use client";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import VotingABI from "../lib/Voting.json";

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export default function Home() {
  const [account, setAccount] = useState<string>("");
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [activeTab, setActiveTab] = useState("vote");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [totalVoters, setTotalVoters] = useState(0);
  const [remainingTime, setRemainingTime] = useState<string>("");
  const [winner, setWinner] = useState("");
  // [멀티시그] 제안 목록과 관리자 수. 비상 관리/선거 시작 버튼이 모두
  // propose()로 바뀌었으므로, 화면에 "대기 중인 제안"을 보여줘야 함.
  const [proposals, setProposals] = useState<any[]>([]);
  const [adminCount, setAdminCount] = useState(0);
  const [requiredApprovals, setRequiredApprovals] = useState(2);

  const connectWallet = async () => {
    if (!(window as any).ethereum) { alert("MetaMask를 설치해주세요!"); return; }
    try {
      await (window as any).ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x7A69" }] });
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setAccount(address);
      const c = new ethers.Contract(CONTRACT_ADDRESS, VotingABI.abi, signer);
      setContract(c);
      showToast("지갑 연결 완료");
    } catch (e: any) { alert("연결 오류: " + e.message); }
  };

  const loadCandidates = async () => {
    if (!contract) return;
    try {
      const count = await contract.getCandidateCount();
      const vc = await contract.voterCount();
      setTotalVoters(Number(vc));
      const list = [];
      for (let i = 0; i < Number(count); i++) {
        const c = await contract.candidates(i);
        list.push({ name: c.name, role: c.role, pledge: c.pledge, voteCount: Number(c.voteCount) });
      }
      setCandidates(list);
    } catch (e) { console.error("loadCandidates error:", e); }
  };

  const loadWinner = async () => {
    if (!contract) return;
    try {
      const winnerName = await contract.getWinner();
      setWinner(winnerName);
    } catch (e) {
      setWinner("");
    }
  };

  // [멀티시그] 현재까지 올라온 제안들을 전부 불러와서,
  // 아직 실행(executed)되지 않은 것만 "승인 대기 중" 목록으로 보여줌.
  const ACTION_LABELS = ["관리자 추가", "관리자 제거", "강제 종료", "선거 재개", "선거 시작"];
  const loadProposals = async () => {
    if (!contract) return;
    try {
      const count = await contract.getProposalCount();
      const ac = await contract.adminCount();
      setAdminCount(Number(ac));
      const ra = await contract.requiredApprovals();
      setRequiredApprovals(Number(ra));
      const list = [];
      for (let i = 0; i < Number(count); i++) {
        const p = await contract.proposals(i);
        if (!p.executed) {
          list.push({
            id: i,
            action: Number(p.action),
            label: ACTION_LABELS[Number(p.action)],
            target: p.target,
            durationMinutes: Number(p.durationMinutes),
            approvalCount: Number(p.approvalCount),
          });
        }
      }
      setProposals(list);
    } catch (e) { console.error("loadProposals error:", e); }
  };

  const approveProposal = async (id: number) => {
    if (!contract) return;
    try {
      const tx = await contract.approve(id);
      await tx.wait();
      showToast("승인했습니다");
      loadProposals();
    } catch (e: any) { alert("오류: " + (e.reason || e.message)); }
  };

  const vote = async (index: number) => {
    if (!contract) { alert("지갑을 먼저 연결해주세요!"); return; }
    setLoading(true);
    try {
      const tx = await contract.vote(index);
      await tx.wait();
      setHasVoted(true);
      showToast("투표가 완료되었습니다 ✓");
      loadCandidates();
    } catch (e: any) { alert("오류: " + (e.reason || e.message)); }
    setLoading(false);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // 컨트랙트 연결 시 후보자/제안 목록 로드
  useEffect(() => { if (contract) { loadCandidates(); loadProposals(); } }, [contract]);

  // 관리자 탭 진입 시 제안 목록 최신화 (다른 계정이 승인했을 수도 있으므로)
  useEffect(() => {
    if (contract && activeTab === "admin") loadProposals();
  }, [activeTab, contract]);

  // 실시간 결과 탭 진입 시 후보자 로드
  useEffect(() => {
    if (contract && activeTab === "results") loadCandidates();
  }, [activeTab, contract]);

  // 투표 종료/강제종료 시 당선자 로드, 다시 진행 중으로 돌아오면 당선자 표시 초기화
  useEffect(() => {
    if ((remainingTime === "투표 종료" || remainingTime === "강제 종료됨") && contract) {
      loadWinner();
    } else if (remainingTime && remainingTime !== "선거 시작 전") {
      setWinner("");
    }
  }, [remainingTime, contract]);

  useEffect(() => {
    if (!contract) return;
    let interval: NodeJS.Timeout;

    const fetchEndTime = async () => {
      try {
        const endTime = await contract.endTime();
        // paused 상태도 같이 조회해서, 멈춰있으면 카운트다운 대신 바로 표시
        let isPaused = false;
        try { isPaused = await contract.paused(); } catch (e) {}

        const now = Math.floor(Date.now() / 1000);
        const diff = Number(endTime) - now;

        if (isPaused) {
          setRemainingTime("강제 종료됨");
        } else if (Number(endTime) === 0) {
          setRemainingTime("선거 시작 전");
        } else if (diff <= 0) {
          setRemainingTime("투표 종료");
        } else {
          const h = Math.floor(diff / 3600);
          const m = Math.floor((diff % 3600) / 60);
          const s = diff % 60;
          setRemainingTime(`${h}시간 ${m}분 ${s}초`);
        }
      } catch (e) { console.error(e); }
    };

    fetchEndTime();
    interval = setInterval(fetchEndTime, 1000);
    return () => clearInterval(interval);
  }, [contract]);

  const totalVotes = candidates.reduce((sum, c) => sum + c.voteCount, 0);
  const turnout = totalVoters > 0 ? ((totalVotes / totalVoters) * 100).toFixed(1) : "0";
  const maxVotes = Math.max(...candidates.map(c => c.voteCount), 1);

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#F9FAFB", minHeight: "100vh" }}>
      <nav style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "0 32px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, fontSize: 18 }}>🗳️ 학급 임원 선거 2026</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {remainingTime && (
            <span style={{ fontSize: 13, color: "#7C3AED", fontWeight: 500, background: "#EDE9FE", padding: "4px 12px", borderRadius: 8 }}>
              ⏱ {remainingTime}
            </span>
          )}
          {account ? (
            <span style={{ fontSize: 13, color: "#6B7280", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981", display: "inline-block" }} />
              {account.slice(0, 6)}...{account.slice(-4)}
            </span>
          ) : (
            <button onClick={connectWallet} style={{ background: "#7C3AED", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>
              지갑 연결
            </button>
          )}
        </div>
      </nav>

      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "0 32px", display: "flex", gap: 0 }}>
        {[["vote", "투표하기"], ["results", "실시간 결과"], ["admin", "관리자"]].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{ padding: "16px 20px", border: "none", background: "none", cursor: "pointer", fontSize: 14, fontWeight: 500, color: activeTab === key ? "#7C3AED" : "#6B7280", borderBottom: activeTab === key ? "2px solid #7C3AED" : "2px solid transparent" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: 32 }}>

        {activeTab === "vote" && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>후보자를 선택하세요</h2>
            <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 24 }}>1인 1표 · 중복 투표 불가</p>
            {candidates.length === 0 ? (
              <div style={{ textAlign: "center", padding: 48, color: "#9CA3AF" }}>
                <p>등록된 후보자가 없습니다.</p>
                <p style={{ fontSize: 13 }}>관리자 탭에서 후보자를 등록해주세요.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {candidates.map((c, i) => (
                  <div key={i} style={{ background: "#fff", border: hasVoted ? "2px solid #E5E7EB" : "1px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
                    <span style={{ background: "#EDE9FE", color: "#7C3AED", fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 6 }}>기호 {i + 1}번</span>
                    <h3 style={{ fontSize: 18, fontWeight: 600, margin: "8px 0 4px" }}>{c.name}</h3>
                    <p style={{ color: "#7C3AED", fontSize: 13, margin: "0 0 8px" }}>{c.role}</p>
                    {c.pledge && (
                      <p style={{ color: "#374151", fontSize: 13, margin: "0 0 12px", background: "#F9FAFB", padding: "8px 10px", borderRadius: 6, lineHeight: 1.5 }}>
                        📋 {c.pledge}
                      </p>
                    )}
                    <button onClick={() => !hasVoted && vote(i)} disabled={hasVoted || loading} style={{ width: "100%", padding: "10px", border: "1px solid #7C3AED", borderRadius: 8, background: hasVoted ? "#F3F4F6" : "#fff", color: hasVoted ? "#9CA3AF" : "#7C3AED", cursor: hasVoted ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 500 }}>
                      {loading ? "처리중..." : hasVoted ? "투표 완료" : "투표하기"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "results" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 600 }}>실시간 투표 현황</h2>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#10B981" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981", display: "inline-block" }} />
                LIVE
              </span>
            </div>
            {remainingTime && (
              <div style={{ background: (remainingTime === "투표 종료" || remainingTime === "강제 종료됨") ? "#FEE2E2" : "#EDE9FE", borderRadius: 12, padding: 20, marginBottom: 24, textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 8px" }}>남은 투표 시간</p>
                <p style={{ fontSize: 32, fontWeight: 700, color: (remainingTime === "투표 종료" || remainingTime === "강제 종료됨") ? "#EF4444" : "#7C3AED", margin: 0 }}>
                  ⏱ {remainingTime}
                </p>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
              {[["총 유권자", `${totalVoters}명`, "#EDE9FE"], ["투표 완료", `${totalVotes}명`, "#E0F2FE"], ["투표율", `${turnout}%`, "#D1FAE5"]].map(([label, value, bg]) => (
                <div key={label} style={{ background: bg, borderRadius: 12, padding: 20 }}>
                  <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 8px" }}>{label}</p>
                  <p style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>후보별 득표 현황</h3>
              {candidates.map((c, i) => (
                <div key={i} style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontWeight: 500 }}>{c.name} <span style={{ fontSize: 12, color: "#7C3AED", background: "#EDE9FE", padding: "1px 6px", borderRadius: 4 }}>{c.role}</span></span>
                    <span style={{ fontSize: 14, color: "#6B7280" }}>{c.voteCount}표 ({totalVotes > 0 ? ((c.voteCount / totalVotes) * 100).toFixed(1) : 0}%)</span>
                  </div>
                  <div style={{ background: "#F3F4F6", borderRadius: 4, height: 40, overflow: "hidden" }}>
                    <div style={{ width: `${totalVotes > 0 ? (c.voteCount / maxVotes) * 100 : 0}%`, height: "100%", background: c.voteCount === maxVotes && c.voteCount > 0 ? "#5B21B6" : "#7C3AED", borderRadius: "0 4px 4px 0", transition: "width 0.8s ease" }} />
                  </div>
                </div>
              ))}
              {candidates.length === 0 && <p style={{ color: "#9CA3AF", textAlign: "center" }}>후보자가 없습니다</p>}
            </div>
            {/* [결과 공개 분리] 정상 종료와 강제 종료를 구분해서 보여준다.
                정상 종료("투표 종료")는 기존처럼 당선자를 바로 공개하지만,
                강제 종료("강제 종료됨")는 비상 상황으로 멈춘 것이므로
                당선자를 바로 공개하지 않고 관리자 검토 안내만 표시한다.
                내부적으로 getWinner()는 이미 호출돼 값을 갖고 있지만,
                화면에 노출하는 시점만 늦추는 것이다(컨트랙트는 그대로 둠). */}
            {winner && remainingTime === "투표 종료" && (
              <div style={{ marginTop: 24, background: "#EDE9FE", borderRadius: 12, padding: 24, textAlign: "center", border: "1px solid #DDD6FE" }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#5B21B6", marginBottom: 8 }}>🏆 최종 당선자</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: "#111827" }}>{winner}</div>
              </div>
            )}
            {winner && remainingTime === "강제 종료됨" && (
              <div style={{ marginTop: 24, background: "#FEF2F2", borderRadius: 12, padding: 24, textAlign: "center", border: "1px solid #FECACA" }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#B91C1C", marginBottom: 8 }}>⚠️ 선거가 강제 종료되었습니다</div>
                <div style={{ fontSize: 14, color: "#7F1D1D" }}>최종 결과는 관리자 검토 후 공개됩니다</div>
              </div>
            )}
            <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 16 }}>⚠️ 투표 마감 후 최종 결과가 확정됩니다</p>
          </div>
        )}

        {activeTab === "admin" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>후보자 등록</h3>
              <AdminCandidateForm contract={contract} onSuccess={() => { loadCandidates(); showToast("후보자가 등록되었습니다"); }} />
            </div>
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>유권자 등록</h3>
              <AdminVoterForm contract={contract} onSuccess={() => showToast("유권자가 등록되었습니다")} />
            </div>
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>선거 시작</h3>
              <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
                관리자가 {requiredApprovals}명 미만이면 제안만 올라가고, 다른 관리자가 아래 "대기 중인 제안"에서 승인해야 실제로 시작됩니다.
              </p>
              <AdminElectionForm contract={contract} onSuccess={() => { showToast("선거 시작이 제안되었습니다"); loadProposals(); }} />
            </div>

            <div style={{ background: "#FEF2F2", borderRadius: 12, border: "1px solid #FECACA", padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, color: "#B91C1C" }}>비상 관리 (Emergency Stop)</h3>
              <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
                강제 종료/재개도 이제 관리자 {requiredApprovals}명의 동의가 필요한 제안으로 처리됩니다.
              </p>
              <AdminEmergencyControl
                contract={contract}
                onPropose={() => { showToast("제안이 등록되었습니다"); loadProposals(); }}
              />
            </div>

            <div style={{ background: "#F5F3FF", borderRadius: 12, border: "1px solid #DDD6FE", padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>관리자 관리</h3>
              <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
                현재 관리자 수: {adminCount}명 (실행 기준 {requiredApprovals}명 동의)
                {adminCount < requiredApprovals && " — 관리자가 더 적을 땐 2번째 관리자 추가만 예외적으로 즉시 반영됩니다."}
              </p>
              <AdminAddForm contract={contract} onSuccess={() => { showToast("관리자 추가가 처리되었습니다"); loadProposals(); }} />
            </div>

            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
                대기 중인 제안 {proposals.length > 0 && `(${proposals.length})`}
              </h3>
              {proposals.length === 0 ? (
                <p style={{ color: "#9CA3AF", fontSize: 14 }}>대기 중인 제안이 없습니다.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {proposals.map((p) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #E5E7EB" }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>#{p.id} {p.label}</span>
                        {p.target && p.target !== "0x0000000000000000000000000000000000000000" && (
                          <span style={{ fontSize: 12, color: "#6B7280", marginLeft: 8 }}>{p.target.slice(0, 6)}...{p.target.slice(-4)}</span>
                        )}
                        <div style={{ fontSize: 12, color: "#7C3AED", marginTop: 4 }}>승인 {p.approvalCount} / {requiredApprovals}</div>
                      </div>
                      <button onClick={() => approveProposal(p.id)} style={{ background: "#7C3AED", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>
                        승인
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: "#10B981", color: "#fff", padding: "12px 24px", borderRadius: 8, fontSize: 14, fontWeight: 500 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function AdminCandidateForm({ contract, onSuccess }: any) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [pledge, setPledge] = useState("");
  const add = async () => {
    if (!contract || !name || !role || !pledge) return;
    try {
      const tx = await contract.addCandidate(name, role, pledge);
      await tx.wait();
      setName(""); setRole(""); setPledge("");
      onSuccess();
    } catch (e: any) { alert("오류: " + (e.reason || e.message)); }
  };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="이름" style={{ flex: 1, padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 14, minWidth: 120 }} />
      <input value={role} onChange={e => setRole(e.target.value)} placeholder="직책 (예: 회장)" style={{ flex: 1, padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 14, minWidth: 120 }} />
      <input value={pledge} onChange={e => setPledge(e.target.value)} placeholder="공약 입력" style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 14 }} />
      <button onClick={add} style={{ background: "#7C3AED", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 14 }}>후보 추가</button>
    </div>
  );
}

function AdminVoterForm({ contract, onSuccess }: any) {
  const [address, setAddress] = useState("");
  const register = async () => {
    if (!contract || !address) return;
    try {
      const tx = await contract.registerVoter(address);
      await tx.wait();
      setAddress("");
      onSuccess();
    } catch (e: any) { alert("오류: " + (e.reason || e.message)); }
  };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input value={address} onChange={e => setAddress(e.target.value)} placeholder="지갑 주소 (0x...)" style={{ flex: 1, padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 14 }} />
      <button onClick={register} style={{ background: "#7C3AED", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 14 }}>등록하기</button>
    </div>
  );
}

// [멀티시그] 더 이상 startElection()을 직접 호출하지 않고,
// propose(ActionType.StartElection = 4, 빈 주소, 분)로 "제안"만 올림.
// 관리자가 1명이면 승인 대기 상태로 남고, 2번째 관리자가 승인해야 실제로 시작됨.
function AdminElectionForm({ contract, onSuccess }: any) {
  const [minutes, setMinutes] = useState("60");
  const start = async () => {
    if (!contract) return;
    try {
      const tx = await contract.propose(4, ethers.ZeroAddress, Number(minutes));
      await tx.wait();
      onSuccess();
    } catch (e: any) { alert("오류: " + (e.reason || e.message)); }
  };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="투표 시간 (분)" type="number" style={{ width: 160, padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 14 }} />
      <span style={{ fontSize: 14, color: "#6B7280" }}>분 동안 진행</span>
      <button onClick={start} style={{ background: "#7C3AED", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 14 }}>선거 시작 제안</button>
    </div>
  );
}

// [멀티시그] 강제종료/재개도 emergencyStop()/resume()을 직접 부르지 않고
// propose(ActionType.EmergencyStop = 2 / Resume = 3, ...)로 제안만 올림.
function AdminEmergencyControl({ contract, onPropose }: any) {
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(false);

  const refreshStatus = async () => {
    if (!contract) return;
    try {
      const p = await contract.paused();
      setPaused(p);
    } catch (e) {}
  };

  useEffect(() => { refreshStatus(); }, [contract]);

  const proposeStop = async () => {
    if (!contract) return;
    if (!confirm("강제 종료를 제안하시겠습니까?")) return;
    setLoading(true);
    try {
      const tx = await contract.propose(2, ethers.ZeroAddress, 0);
      await tx.wait();
      await refreshStatus();
      onPropose();
    } catch (e: any) { alert("오류: " + (e.reason || e.message)); }
    setLoading(false);
  };

  const proposeResume = async () => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.propose(3, ethers.ZeroAddress, 0);
      await tx.wait();
      await refreshStatus();
      onPropose();
    } catch (e: any) { alert("오류: " + (e.reason || e.message)); }
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{
        fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999,
        background: paused ? "#FEE2E2" : "#DCFCE7",
        color: paused ? "#B91C1C" : "#166534",
      }}>
        {paused ? "정지됨" : "정상 진행"}
      </span>

      {!paused ? (
        <button onClick={proposeStop} disabled={loading}
          style={{ background: "#DC2626", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: loading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 500 }}>
          {loading ? "처리 중..." : "강제 종료 제안"}
        </button>
      ) : (
        <button onClick={proposeResume} disabled={loading}
          style={{ background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: loading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 500 }}>
          {loading ? "처리 중..." : "선거 재개 제안"}
        </button>
      )}
    </div>
  );
}

// [멀티시그] 새 관리자 추가도 propose(ActionType.AddAdmin = 0, 대상주소, 0)로 처리.
// 현재 관리자가 requiredApprovals(기본 2)명 미만이면 컨트랙트가 즉시 반영하고,
// 그 이상이면 다른 관리자의 승인이 필요한 제안으로만 등록됨.
function AdminAddForm({ contract, onSuccess }: any) {
  const [address, setAddress] = useState("");
  const addAdmin = async () => {
    if (!contract || !address) return;
    try {
      const tx = await contract.propose(0, address, 0);
      await tx.wait();
      setAddress("");
      onSuccess();
    } catch (e: any) { alert("오류: " + (e.reason || e.message)); }
  };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input value={address} onChange={e => setAddress(e.target.value)} placeholder="새 관리자 지갑 주소 (0x...)" style={{ flex: 1, padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 14 }} />
      <button onClick={addAdmin} style={{ background: "#7C3AED", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 14 }}>추가 제안</button>
    </div>
  );
}
