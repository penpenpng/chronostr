import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { useAlert } from "@/hooks/use-alert";
import { getEventCalendar, getRSVP } from "@/services/event-calender";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { JoinTheEventDialog } from "@/components/join-the-event";
import { formatDate } from "@/lib/formatDate";
import { useNDK } from "@/hooks/use-ndk";
import type NDK from "@nostr-dev-kit/ndk";
import { CalendarTable } from "@/components/calendar-table";
import { AppLocalStorage } from "@/services/app-local-storage";
import { CopyUrlButton } from "@/components/copy-url-button";
import { User } from "@/components/user";

const appStorage = new AppLocalStorage();

export const EventCalendarPage = () => {
  const { naddr } = useParams();
  if (!naddr) {
    throw Error();
  }

  const { setAlert } = useAlert();

  const { ndk, assignPrivateKey, signerType } = useNDK();

  // Queries
  const { data: calendar } = useSuspenseQuery({
    queryKey: [ndk, naddr],
    queryFn: ({ queryKey }) => {
      const [ndk, naddr] = queryKey as [NDK, string];
      if (!ndk) {
        return null;
      }
      return getEventCalendar(ndk, naddr);
    },
  });

  const {
    data: rsvp,
    error: rsvpError,
    refetch: rsvpRefetch,
    isLoading: isRSVPLoading,
  } = useQuery({
    queryKey: [ndk, naddr, "rsvp"],
    queryFn: async ({ queryKey }) => {
      const [ndk] = queryKey as [NDK?];

      if (!ndk || !calendar) {
        return null;
      }

      try {
        const rsvp = await getRSVP(ndk, calendar.dates, true);
        return rsvp;
      } catch (e) {
        setAlert({
          title: "RSVP Fetch Error",
          description: String(e),
        });
        throw e;
      }
    },
  });

  useEffect(() => {
    if (rsvpError) {
      setAlert({
        title: rsvpError.name,
        description: rsvpError?.message,
        variant: "destructive",
      });
    }
  }, [rsvpError, setAlert]);

  useEffect(() => {
    if (!calendar || ndk?.activeUser) {
      return;
    }

    const privKey = appStorage.getItem(`${calendar.id}.privateKey`);
    if (!privKey) {
      return;
    }

    assignPrivateKey(privKey).catch((e) => {
      setAlert({
        title: "Account Error",
        description: e,
      });
    });
  }, [assignPrivateKey, calendar, ndk?.activeUser, setAlert]);

  const submitRSVPErrorHandler = (e: unknown) => {
    setAlert({
      title: "Failed to Submit.",
      description: String(e),
      variant: "destructive",
    });
  };

  const myRSVP = useMemo(() => {
    if (!rsvp || !ndk || !ndk.activeUser) return undefined;
    if (ndk.activeUser.pubkey in rsvp.rsvpPerUsers) {
      return rsvp.rsvpPerUsers?.[ndk.activeUser.pubkey];
    }
    return undefined;
  }, [ndk, rsvp]);

  if (!calendar) {
    return <></>;
  }

  return (
    <Layout>
      <div className="space-y-4">
        <Card className="p-6 grow flex items-stretch justify-between">
          <div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold">{calendar.title}</h1>
              <a
                href={`https://nostter.app/${calendar.owner.npub}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block"
              >
                <User user={calendar.owner} type="info" />
              </a>
              <p className="text-gray-500">{calendar.description}</p>
            </div>
            <div className="mt-4 text-gray-500 font-medium">
              <p>👤 {Object.keys(rsvp?.rsvpPerUsers || {}).length}</p>
              <p>
                🗓️ {formatDate(calendar.dates[0].date)} ~{" "}
                {formatDate(calendar.dates.slice(-1)[0].date)}
              </p>
            </div>
          </div>
          <div className="flex flex-col justify-between items-end">
            <CopyUrlButton url={location.href} />
            <JoinTheEventDialog
              eventCalender={calendar}
              beforeRSVP={myRSVP?.rsvp}
              isLoading={isRSVPLoading}
              name={
                signerType === "privateKey"
                  ? myRSVP?.user?.profile?.name
                  : undefined
              }
              onRSVPComplete={() => rsvpRefetch()}
              onRSVPError={submitRSVPErrorHandler}
            />
          </div>
        </Card>
        <Card>
          <CalendarTable calendar={calendar} rsvp={rsvp || undefined} />
        </Card>
      </div>
    </Layout>
  );
};
