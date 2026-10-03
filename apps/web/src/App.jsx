import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import GuestLayout from "./layout/GuestLayout";
import Home from "./pages/guest/Home";
import RoomList from "./pages/guest/RoomList";
import RoomDetail from "./pages/guest/RoomDetail";
import PageLoader from "./components/PageLoader";
import PrivateRoute from "./routes/PrivateRoute";
import PublicRoute from "./routes/PublicRoute";
import { ADMIN_HOME } from "./utils/authRedirect";

// The public pages above ship in the first bundle. Everything behind a
// login is loaded on demand, so a guest browsing rooms never downloads the
// admin screens (or the charting library they use).
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const MyBookings = lazy(() => import("./pages/MyBookings"));
const PaymentResult = lazy(() => import("./pages/PaymentResult"));
const AccountSettings = lazy(() => import("./pages/AccountSettings"));
const PropertySettings = lazy(() => import("./pages/PropertySettings"));
const Destinations = lazy(() => import("./pages/Destinations"));
const Credits = lazy(() => import("./pages/guest/Credits"));
const MainLayout = lazy(() => import("./layout/MainLayout"));
const Dashboard = lazy(() => import("./pages/admin/dashboard/DashboardPage"));
const Users = lazy(() => import("./pages/admin/users/UsersPage"));
const Rooms = lazy(() => import("./pages/admin/rooms/RoomsPage"));
const Orders = lazy(() => import("./pages/admin/orders/OrdersPage"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Coupons = lazy(() => import("./pages/Coupons"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Unauthorized = lazy(() => import("./pages/Unauthorized"));

const guestOnly = (page) => <PublicRoute>{page}</PublicRoute>;
const signedIn = (page) => <PrivateRoute>{page}</PrivateRoute>;
const admin = (page) => (
  <PrivateRoute role="admin">
    <MainLayout>{page}</MainLayout>
  </PrivateRoute>
);

// Admin screens used to live at the top level (/dashboard, /users, ...).
// They are now under /admin; the old addresses still work.
const LEGACY_ADMIN_PATHS = {
  "/dashboard": ADMIN_HOME,
  "/users": `${ADMIN_HOME}/users`,
  "/orders": `${ADMIN_HOME}/orders`,
  "/calendar": `${ADMIN_HOME}/calendar`,
  "/coupons": `${ADMIN_HOME}/coupons`,
};

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public guest site: no login needed to browse */}
        <Route element={<GuestLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/rooms" element={<RoomList />} />
          <Route path="/rooms/:id" element={<RoomDetail />} />
          <Route path="/my-bookings" element={signedIn(<MyBookings />)} />
          <Route path="/credits" element={<Credits />} />
        </Route>
        <Route path="/booking" element={<Navigate to="/rooms" replace />} />

        {/* Sign-in pages */}
        <Route path="/login" element={guestOnly(<Login />)} />
        <Route path="/register" element={guestOnly(<Register />)} />
        <Route path="/forgot-password" element={guestOnly(<ForgotPassword />)} />
        <Route path="/reset-password" element={guestOnly(<ResetPassword />)} />

        {/* Signed-in guests and admins */}
        <Route path="/payment/result" element={signedIn(<PaymentResult />)} />
        <Route path="/settings" element={signedIn(<AccountSettings />)} />
        <Route path="/profile" element={signedIn(<AccountSettings />)} />

        {/* Admin */}
        <Route path={ADMIN_HOME} element={admin(<Dashboard />)} />
        <Route path={`${ADMIN_HOME}/users`} element={admin(<Users />)} />
        <Route path={`${ADMIN_HOME}/rooms`} element={admin(<Rooms />)} />
        <Route path={`${ADMIN_HOME}/orders`} element={admin(<Orders />)} />
        <Route path={`${ADMIN_HOME}/calendar`} element={admin(<Calendar />)} />
        <Route path={`${ADMIN_HOME}/coupons`} element={admin(<Coupons />)} />
        <Route path={`${ADMIN_HOME}/property`} element={admin(<PropertySettings />)} />
        <Route path={`${ADMIN_HOME}/destinations`} element={admin(<Destinations />)} />
        {Object.entries(LEGACY_ADMIN_PATHS).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}

        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default App;
