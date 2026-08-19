import { useState } from "react";
import UsersTable from "@/components/UsersTable";

const TeamPage = () => {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-6">
      <UsersTable refreshToken={refreshToken} />
    </div>
  );
};

export default TeamPage;
