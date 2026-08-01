import { SharedBoardView } from "@/components/share/SharedBoardView";

/** Public, view-only board behind a share token. No session required. */
export default function SharePage({ params }: { params: { token: string } }) {
  return <SharedBoardView token={params.token} />;
}
