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

  // 컨트랙트 연결 시 후보자 로드
  useEffect(() => { if (contract) loadCandidates(); }, [contract]);

  // 실시간 결과 탭 진입 시 후보자 로드
  useEffect(() => {
    if (contract && activeTab === "results") loadCandidates();
  }, [activeTab, contract]);

  // 투표 종료 시 당선자 로드
  useEffect(() => {
    if (remainingTime === "투표 종료" && contract) loadWinner();
  }, [remainingTime, contract]);

  useEffect(() => {
    if (!contract) return;
    let interval: NodeJS.Timeout;

    const fetchEndTime = async () => {
      try {
        const endTime = await contract.endTime();
        const now = Math.floor(Date.now() / 1000);
        const diff = Number(endTime) - now;

        if (Number(endTime) === 0) {
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
              <div style={{ background: remainingTime === "투표 종료" ? "#FEE2E2" : "#EDE9FE", borderRadius: 12, padding: 20, marginBottom: 24, textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 8px" }}>남은 투표 시간</p>
                <p style={{ fontSize: 32, fontWeight: 700, color: remainingTime === "투표 종료" ? "#EF4444" : "#7C3AED", margin: 0 }}>
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
            {winner && (
              <div style={{ marginTop: 24, background: "#EDE9FE", borderRadius: 12, padding: 24, textAlign: "center", border: "1px solid #DDD6FE" }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#5B21B6", marginBottom: 8 }}>🏆 최종 당선자</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: "#111827" }}>{winner}</div>
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
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>선거 시작</h3>
              <AdminElectionForm contract={contract} onSuccess={() => showToast("선거가 시작되었습니다")} />
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

function AdminElectionForm({ contract, onSuccess }: any) {
  const [minutes, setMinutes] = useState("60");
  const start = async () => {
    if (!contract) return;
    try {
      const tx = await contract.startElection(Number(minutes));
      await tx.wait();
      onSuccess();
    } catch (e: any) { alert("오류: " + (e.reason || e.message)); }
  };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="투표 시간 (분)" type="number" style={{ width: 160, padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 14 }} />
      <span style={{ fontSize: 14, color: "#6B7280" }}>분 동안 진행</span>
      <button onClick={start} style={{ background: "#7C3AED", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 14 }}>선거 시작</button>
    </div>
  );
}
