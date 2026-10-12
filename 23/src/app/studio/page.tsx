import type {Metadata} from 'next';
import {headers} from 'next/headers';
import Studio from '@/components/studio/studio';
import {isLocalHost, studioToken} from '../../../visualmaker/core/http';
import './studio.css';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'VisualMaker · 장면 설계 작업대'};

export default async function StudioPage(){
  const host=(await headers()).get('host')||'';
  if(!isLocalHost(host))return <main>VisualMaker는 이 PC의 localhost 주소로 접속하세요.</main>;
  return <Studio token={studioToken()}/>;
}
