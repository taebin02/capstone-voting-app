import { getAddress, ZeroAddress } from 'ethers';

export function resolveVotingNetwork(chainValue?: string, addressValue?: string) {
  const chainId = chainValue ? Number(chainValue) : 31337;
  if (chainId !== 31337 && chainId !== 11155111) {
    throw new Error('지원하지 않는 체인입니다. Hardhat 또는 Sepolia를 선택해주세요.');
  }
  const address = addressValue || (chainId === 31337 ? '0x5FbDB2315678afecb367f032d93F642f64180aa3' : '');
  if (!address) throw new Error('Sepolia 배포 주소를 NEXT_PUBLIC_VOTING_ADDRESS에 설정해주세요.');
  let checked: string;
  try { checked = getAddress(address); } catch { throw new Error('컨트랙트 주소 형식이 올바르지 않습니다.'); }
  if (checked === ZeroAddress) throw new Error('컨트랙트 주소에 0주소를 사용할 수 없습니다.');
  return { chainId, chainHex: '0x' + chainId.toString(16), address: checked,
    label: chainId === 31337 ? 'Hardhat (로컬)' : 'Sepolia (테스트넷)' };
}
